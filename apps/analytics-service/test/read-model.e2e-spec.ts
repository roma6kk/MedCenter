import type { DataSource } from 'typeorm';

import { TypeOrmReportsRepository } from '../src/modules/reports/reports.repository';
import { TypeOrmReadModelWriter, type BookedFact, type EventMeta } from '../src/modules/worker/read-model.writer';
import { describeWithDocker, startReadModelDatabase, type ReadModelDatabase } from './postgres-fixture';

const OCTOBER = { from: new Date('2026-10-01T00:00:00.000Z'), toExclusive: new Date('2026-11-01T00:00:00.000Z') };

function meta(eventId: string, eventType = 'appointment.booked.v1'): EventMeta {
  return { eventId, eventType, occurredAt: new Date('2026-10-01T08:00:00.000Z') };
}

function booking(appointmentId: string, serviceId: string, start: string): BookedFact {
  return {
    appointmentId,
    patientRef: 'Patient/pat-1',
    practitionerRoleRef: 'PractitionerRole/role-1',
    serviceId,
    slotRef: `Slot/${appointmentId}`,
    startAt: new Date(start),
    bookedAt: new Date('2026-10-01T08:00:00.000Z'),
  };
}

/**
 * The read-model against a real PostgreSQL 16 (Testcontainers), through the
 * production migration — the SQL the unit suites mock is executed here.
 */
describeWithDocker('analytics read-model (PostgreSQL, Testcontainers)', () => {
  let database: ReadModelDatabase;
  let dataSource: DataSource;
  let writer: TypeOrmReadModelWriter;
  let reports: TypeOrmReportsRepository;

  beforeAll(async () => {
    database = await startReadModelDatabase();
    dataSource = database.dataSource;
    writer = new TypeOrmReadModelWriter(dataSource);
    reports = new TypeOrmReportsRepository(dataSource);
  }, 180_000);

  afterAll(async () => {
    await database?.stop();
  }, 60_000);

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE "analytics"."processed_event", "analytics"."appointment_fact", "analytics"."encounter_fact", "analytics"."audit_event", "analytics"."sync_cursor"',
    );
  });

  it('should create the five read-model tables in the analytics schema when migrated', async () => {
    const rows: ReadonlyArray<{ table_name: string }> = await dataSource.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'analytics' ORDER BY table_name`,
    );

    expect(rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining(['appointment_fact', 'audit_event', 'encounter_fact', 'processed_event', 'sync_cursor']),
    );
  });

  it('should apply an event once and report the redelivery as a duplicate when the same eventId arrives twice', async () => {
    expect(await writer.applyBooked(meta('evt-1'), booking('apt-1', 'svc-1', '2026-10-05T09:00:00Z'))).toBe('applied');
    expect(await writer.applyBooked(meta('evt-1'), booking('apt-1', 'svc-1', '2026-10-05T09:00:00Z'))).toBe('duplicate');

    expect(await writer.isProcessed('evt-1')).toBe(true);
    expect(await reports.countAppointmentsByStatus(OCTOBER, [])).toEqual([{ status: 'booked', count: '1' }]);
  });

  it('should let exactly one of two concurrent deliveries of the same event win when they race', async () => {
    const outcomes = await Promise.all([
      writer.applyBooked(meta('evt-race'), booking('apt-r', 'svc-1', '2026-10-05T09:00:00Z')),
      writer.applyBooked(meta('evt-race'), booking('apt-r', 'svc-1', '2026-10-05T09:00:00Z')),
    ]);

    expect([...outcomes].sort()).toEqual(['applied', 'duplicate']);
  });

  it('should keep a cancellation that overtook its booking when the booking arrives later', async () => {
    await writer.applyCancelled(meta('evt-c', 'appointment.cancelled.v1'), {
      appointmentId: 'apt-2',
      patientRef: 'Patient/pat-1',
      cancelledAt: new Date('2026-10-02T08:00:00Z'),
      actorType: 'PATIENT',
    });
    await writer.applyBooked(meta('evt-b'), booking('apt-2', 'svc-1', '2026-10-06T09:00:00Z'));

    expect(await reports.countAppointmentsByStatus(OCTOBER, [])).toEqual([{ status: 'cancelled', count: '1' }]);
  });

  it('should count only appointments whose start lies in the half-open period when the range is queried', async () => {
    await writer.applyBooked(meta('e1'), booking('a1', 'svc-1', '2026-10-01T00:00:00Z'));
    await writer.applyBooked(meta('e2'), booking('a2', 'svc-1', '2026-10-31T23:59:59Z'));
    await writer.applyBooked(meta('e3'), booking('a3', 'svc-1', '2026-11-01T00:00:00Z'));

    expect(await reports.countAppointmentsByStatus(OCTOBER, [])).toEqual([{ status: 'booked', count: '2' }]);
  });

  describe('no-show classification (API §9.1)', () => {
    async function seed(): Promise<void> {
      await writer.applyBooked(meta('n1'), booking('apt-a', 'svc-1', '2026-10-05T09:00:00Z'));
      await writer.applyBooked(meta('n2'), booking('apt-b', 'svc-1', '2026-10-06T09:00:00Z'));
      await writer.applyBooked(meta('n3'), booking('apt-c', 'svc-1', '2026-10-07T09:00:00Z'));
      await writer.applyBooked(meta('n4'), booking('apt-out', 'svc-1', '2026-11-03T09:00:00Z'));
      await writer.applyCancelled(meta('n5', 'appointment.cancelled.v1'), {
        appointmentId: 'apt-c',
        patientRef: 'Patient/pat-1',
        cancelledAt: new Date('2026-10-04T08:00:00Z'),
        actorType: 'PATIENT',
      });
    }

    async function countsByStatus(noShowIds: ReadonlyArray<string>): Promise<Record<string, string>> {
      const rows = await reports.countAppointmentsByStatus(OCTOBER, noShowIds);
      return Object.fromEntries(rows.map((row) => [row.status, String(row.count)]));
    }

    it('should move a booked appointment into noshow when HAPI lists it as a no-show', async () => {
      await seed();

      expect(await countsByStatus(['apt-a'])).toEqual({ booked: '1', cancelled: '1', noshow: '1' });
    });

    it('should leave every count untouched when HAPI lists no no-show', async () => {
      await seed();

      expect(await countsByStatus([])).toEqual({ booked: '2', cancelled: '1' });
    });

    it('should ignore a HAPI no-show the read-model never saw when its id is listed, so the counts describe one population', async () => {
      await seed();

      expect(await countsByStatus(['apt-unseen-1', 'apt-unseen-2'])).toEqual({ booked: '2', cancelled: '1' });
    });

    it('should keep a cancelled appointment cancelled when HAPI also lists it as a no-show', async () => {
      await seed();

      expect(await countsByStatus(['apt-c'])).toEqual({ booked: '2', cancelled: '1' });
    });

    it('should not count a no-show whose start lies outside the period when its id is listed', async () => {
      await seed();

      expect(await countsByStatus(['apt-out'])).toEqual({ booked: '2', cancelled: '1' });
    });

    it('should stay a partition of the population when many no-show ids are passed as one array', async () => {
      await seed();
      const manyIds = [...Array.from({ length: 5000 }, (_, index) => `apt-unseen-${index}`), 'apt-b'];

      expect(await countsByStatus(manyIds)).toEqual({ booked: '1', cancelled: '1', noshow: '1' });
    });
  });

  it('should rank services by bookings excluding cancellations when a limit is given', async () => {
    await writer.applyBooked(meta('s1'), booking('b1', 'svc-a', '2026-10-05T09:00:00Z'));
    await writer.applyBooked(meta('s2'), booking('b2', 'svc-b', '2026-10-05T10:00:00Z'));
    await writer.applyBooked(meta('s3'), booking('b3', 'svc-b', '2026-10-05T11:00:00Z'));
    await writer.applyBooked(meta('s4'), booking('b4', 'svc-c', '2026-10-05T12:00:00Z'));
    await writer.applyCancelled(meta('s5', 'appointment.cancelled.v1'), {
      appointmentId: 'b4',
      patientRef: 'Patient/pat-1',
      cancelledAt: new Date('2026-10-04T08:00:00Z'),
      actorType: 'ADMIN',
    });

    expect(await reports.countBookingsByService(OCTOBER, 2)).toEqual([
      { serviceId: 'svc-b', count: '2' },
      { serviceId: 'svc-a', count: '1' },
    ]);
  });

  it('should group completed encounters by specialty, most frequent first, when the period is queried', async () => {
    const encounter = (id: string, code: string, display: string | null) =>
      writer.applyEncounterCompleted(meta(`enc-${id}`, 'encounter.completed.v1'), {
        encounterId: id,
        patientRef: 'Patient/pat-1',
        practitionerRef: 'PractitionerRole/role-1',
        specialtySystem: null,
        specialtyCode: code,
        specialtyDisplay: display,
        completedAt: new Date('2026-10-10T10:00:00Z'),
        diagnosisCount: 1,
      });
    await encounter('e1', 'cardio', 'Кардиология');
    await encounter('e2', 'cardio', 'Кардиология');
    await encounter('e3', 'unknown', null);

    expect(await reports.countEncountersBySpecialty(OCTOBER)).toEqual([
      { system: null, code: 'cardio', display: 'Кардиология', count: '2' },
      { system: null, code: 'unknown', display: null, count: '1' },
    ]);
  });

  it('should keep the same code in two code systems apart when encounters are grouped by specialty', async () => {
    const encounter = (id: string, system: string | null) =>
      writer.applyEncounterCompleted(meta(`enc-${id}`, 'encounter.completed.v1'), {
        encounterId: id,
        patientRef: 'Patient/pat-1',
        practitionerRef: 'PractitionerRole/role-1',
        specialtySystem: system,
        specialtyCode: '394579002',
        specialtyDisplay: 'Cardiology',
        completedAt: new Date('2026-10-10T10:00:00Z'),
        diagnosisCount: 0,
      });
    await encounter('e1', 'http://snomed.info/sct');
    await encounter('e2', 'http://snomed.info/sct');
    await encounter('e3', 'https://fhir.by/CodeSystem/specialty');
    await encounter('e4', null);

    expect(await reports.countEncountersBySpecialty(OCTOBER)).toEqual([
      { system: 'http://snomed.info/sct', code: '394579002', display: 'Cardiology', count: '2' },
      { system: null, code: '394579002', display: 'Cardiology', count: '1' },
      { system: 'https://fhir.by/CodeSystem/specialty', code: '394579002', display: 'Cardiology', count: '1' },
    ]);
  });
});
