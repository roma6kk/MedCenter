import { Logger } from '@nestjs/common';
import type { AppointmentBookedEvent, AppointmentCancelledEvent, EncounterCompletedEvent } from '@medcenter/contracts';

import { IngestionService } from './ingestion.service';
import type { ReadModelWriter } from './read-model.writer';
import { UNKNOWN_SPECIALTY, type SpecialtyResolver } from './specialty.resolver';

const BOOKED: AppointmentBookedEvent = {
  v: 1,
  type: 'appointment.booked.v1',
  eventId: 'evt-1',
  occurredAt: '2026-10-08T10:00:00.000Z',
  appointmentId: 'apt-1',
  patientRef: 'Patient/pat-1',
  practitionerRoleRef: 'PractitionerRole/role-1',
  slotRef: 'Slot/slot-1',
  start: '2026-11-02T09:00:00+03:00',
  serviceId: 'svc-1',
};

const CANCELLED: AppointmentCancelledEvent = {
  v: 1,
  type: 'appointment.cancelled.v1',
  eventId: 'evt-2',
  occurredAt: '2026-10-09T10:00:00.000Z',
  appointmentId: 'apt-1',
  patientRef: 'Patient/pat-1',
  reason: 'Пациент заболел',
  actorType: 'ADMIN',
};

const COMPLETED: EncounterCompletedEvent = {
  v: 1,
  type: 'encounter.completed.v1',
  eventId: 'evt-3',
  occurredAt: '2026-11-02T06:40:00.000Z',
  encounterId: 'enc-1',
  patientRef: 'Patient/pat-1',
  practitionerRef: 'PractitionerRole/role-1',
  diagnoses: [
    { code: 'I10', display: 'Эссенциальная гипертензия' },
    { code: 'E11.9', display: 'Сахарный диабет 2 типа' },
  ],
};

describe('IngestionService', () => {
  let writer: jest.Mocked<ReadModelWriter>;
  let specialties: jest.Mocked<Pick<SpecialtyResolver, 'resolve'>>;
  let ingestion: IngestionService;

  beforeEach(() => {
    writer = {
      isProcessed: jest.fn().mockResolvedValue(false),
      applyBooked: jest.fn().mockResolvedValue('applied'),
      applyCancelled: jest.fn().mockResolvedValue('applied'),
      applyEncounterCompleted: jest.fn().mockResolvedValue('applied'),
    };
    specialties = { resolve: jest.fn().mockResolvedValue({ system: 'http://snomed.info/sct', code: '394579002', display: 'Кардиология' }) };
    ingestion = new IngestionService(writer, specialties as unknown as SpecialtyResolver);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should record the booking with its start instant when appointment.booked.v1 arrives', async () => {
    await ingestion.ingest(BOOKED);

    expect(writer.applyBooked).toHaveBeenCalledWith(
      { eventId: 'evt-1', eventType: 'appointment.booked.v1', occurredAt: new Date('2026-10-08T10:00:00.000Z') },
      {
        appointmentId: 'apt-1',
        patientRef: 'Patient/pat-1',
        practitionerRoleRef: 'PractitionerRole/role-1',
        serviceId: 'svc-1',
        slotRef: 'Slot/slot-1',
        startAt: new Date('2026-11-02T06:00:00.000Z'),
        bookedAt: new Date('2026-10-08T10:00:00.000Z'),
      },
    );
  });

  it('should record the cancellation with its actor when appointment.cancelled.v1 arrives', async () => {
    await ingestion.ingest(CANCELLED);

    expect(writer.applyCancelled).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'evt-2' }), {
      appointmentId: 'apt-1',
      patientRef: 'Patient/pat-1',
      cancelledAt: new Date('2026-10-09T10:00:00.000Z'),
      actorType: 'ADMIN',
    });
  });

  it('should store the resolved specialty and the diagnosis count when encounter.completed.v1 arrives', async () => {
    await ingestion.ingest(COMPLETED);

    expect(specialties.resolve).toHaveBeenCalledWith('PractitionerRole/role-1');
    expect(writer.applyEncounterCompleted).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'evt-3' }), {
      encounterId: 'enc-1',
      patientRef: 'Patient/pat-1',
      practitionerRef: 'PractitionerRole/role-1',
      specialtySystem: 'http://snomed.info/sct',
      specialtyCode: '394579002',
      specialtyDisplay: 'Кардиология',
      completedAt: new Date('2026-11-02T06:40:00.000Z'),
      diagnosisCount: 2,
    });
  });

  it('should skip the HAPI lookup when the encounter event was already processed', async () => {
    writer.isProcessed.mockResolvedValue(true);

    const outcome = await ingestion.ingest(COMPLETED);

    expect(outcome).toBe('duplicate');
    expect(specialties.resolve).not.toHaveBeenCalled();
    expect(writer.applyEncounterCompleted).not.toHaveBeenCalled();
  });

  it('should file the encounter under the unknown specialty when the role has none', async () => {
    specialties.resolve.mockResolvedValue(UNKNOWN_SPECIALTY);

    await ingestion.ingest(COMPLETED);

    expect(writer.applyEncounterCompleted).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ specialtyCode: 'unknown', specialtySystem: null, specialtyDisplay: null }),
    );
  });

  it('should clip an oversized free-text specialty when it would not fit the read-model column', async () => {
    specialties.resolve.mockResolvedValue({ system: null, code: 'x'.repeat(300), display: 'y'.repeat(300) });

    await ingestion.ingest(COMPLETED);

    const fact = writer.applyEncounterCompleted.mock.calls[0]?.[1];
    expect(fact?.specialtyCode).toHaveLength(128);
    expect(fact?.specialtyDisplay).toHaveLength(255);
  });

  it('should propagate a HAPI failure when the specialty cannot be resolved, so nothing is written', async () => {
    specialties.resolve.mockRejectedValue(new Error('HAPI down'));

    await expect(ingestion.ingest(COMPLETED)).rejects.toThrow('HAPI down');
    expect(writer.applyEncounterCompleted).not.toHaveBeenCalled();
  });

  it('should file the encounter under unknown when the last attempt cannot reach HAPI, so it still counts in §9.2', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    specialties.resolve.mockRejectedValue(new Error('HAPI down'));

    const outcome = await ingestion.ingest(COMPLETED, { isLastAttempt: true });

    expect(outcome).toBe('applied');
    expect(writer.applyEncounterCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'evt-3' }),
      expect.objectContaining({ encounterId: 'enc-1', specialtyCode: 'unknown', specialtySystem: null, specialtyDisplay: null }),
    );
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ encounterId: 'enc-1' }), expect.stringContaining('unknown'));
  });

  it('should keep propagating the HAPI failure when retries remain, so the right label is waited for', async () => {
    specialties.resolve.mockRejectedValue(new Error('HAPI down'));

    await expect(ingestion.ingest(COMPLETED, { isLastAttempt: false })).rejects.toThrow('HAPI down');
    await expect(ingestion.ingest(COMPLETED)).rejects.toThrow('HAPI down');
    expect(writer.applyEncounterCompleted).not.toHaveBeenCalled();
  });

  it('should still propagate a database failure on the last attempt when only the specialty lookup is forgiven', async () => {
    writer.applyEncounterCompleted.mockRejectedValue(new Error('db down'));

    await expect(ingestion.ingest(COMPLETED, { isLastAttempt: true })).rejects.toThrow('db down');
  });

  it('should report a duplicate when the writer finds the eventId in the ledger', async () => {
    writer.applyBooked.mockResolvedValue('duplicate');

    expect(await ingestion.ingest(BOOKED)).toBe('duplicate');
  });
});
