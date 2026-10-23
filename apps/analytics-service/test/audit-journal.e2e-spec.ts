import { Logger } from '@nestjs/common';
import type { FhirClient, FhirResource } from '@medcenter/fhir';
import type { DataSource } from 'typeorm';

import { AUDIT_CURSOR, AuditSyncService } from '../src/modules/audit/audit-sync.service';
import { TypeOrmAuditRepository, isRowRejection, type AuditEventRow } from '../src/modules/audit/audit.repository';
import { describeWithDocker, startReadModelDatabase, type ReadModelDatabase } from './postgres-fixture';

const OCTOBER = { from: new Date('2026-10-01T00:00:00.000Z'), toExclusive: new Date('2026-11-01T00:00:00.000Z') };

function auditRow(id: string, occurredAt: string, userId: string, resource: string): AuditEventRow {
  const [resourceType, resourceId] = resource.split('/');
  return {
    id,
    occurredAt: new Date(occurredAt),
    userId,
    action: 'create',
    resourceType: resourceType ?? null,
    resourceId: resourceId ?? null,
    requestId: null,
    source: 'appointment-service',
    reason: null,
  };
}

/** An `AuditEvent` as HAPI returns it; `overrides` is where a test makes it hostile. */
function auditEvent(id: string, recorded: string, overrides: Record<string, unknown> = {}): FhirResource {
  return {
    resourceType: 'AuditEvent',
    id,
    meta: { lastUpdated: recorded },
    subtype: [{ system: 'http://hl7.org/fhir/restful-interaction', code: 'create' }],
    action: 'C',
    recorded,
    agent: [{ who: { identifier: { value: 'user-1' } }, requestor: true }],
    source: { observer: { display: 'appointment-service' } },
    entity: [{ what: { reference: `Appointment/${id}` } }],
    ...overrides,
  };
}

function hapiReturning(resources: ReadonlyArray<FhirResource>): FhirClient {
  return {
    search: jest.fn().mockResolvedValueOnce({ entry: resources.map((resource) => ({ resource })) }).mockResolvedValue({ entry: [] }),
  } as unknown as FhirClient;
}

/**
 * The journal read-model and its HAPI sync against a real PostgreSQL 16
 * (Testcontainers): the column widths and error codes the unit suites can only assume.
 */
describeWithDocker('audit journal (PostgreSQL, Testcontainers)', () => {
  let database: ReadModelDatabase;
  let dataSource: DataSource;
  let audit: TypeOrmAuditRepository;

  beforeAll(async () => {
    database = await startReadModelDatabase();
    dataSource = database.dataSource;
    audit = new TypeOrmAuditRepository(dataSource);
  }, 180_000);

  afterAll(async () => {
    await database?.stop();
  }, 60_000);

  beforeEach(async () => {
    await dataSource.query('TRUNCATE "analytics"."audit_event", "analytics"."sync_cursor"');
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should insert journal rows once and page them newest first with the total when rows repeat', async () => {
    const rows = [
      auditRow('ae-1', '2026-10-08T10:00:00Z', 'user-1', 'Appointment/apt-1'),
      auditRow('ae-2', '2026-10-09T10:00:00Z', 'user-2', 'Appointment/apt-1'),
      auditRow('ae-3', '2026-10-10T10:00:00Z', 'user-1', 'Encounter/enc-1'),
    ];
    await audit.insertMany(rows);
    await audit.insertMany(rows);

    const page = await audit.findPage({ range: OCTOBER, userId: 'user-1' }, { offset: 0, limit: 1 });

    expect(page.total).toBe(2);
    expect(page.rows.map((row) => row.id)).toEqual(['ae-3']);
  });

  it('should filter the journal by resource type and id when both are given', async () => {
    await audit.insertMany([
      auditRow('ae-1', '2026-10-08T10:00:00Z', 'user-1', 'Appointment/apt-1'),
      auditRow('ae-2', '2026-10-09T10:00:00Z', 'user-1', 'Appointment/apt-2'),
    ]);

    const page = await audit.findPage(
      { range: OCTOBER, resourceType: 'Appointment', resourceId: 'apt-2' },
      { offset: 0, limit: 20 },
    );

    expect(page.rows.map((row) => row.id)).toEqual(['ae-2']);
  });

  it('should only move the sync cursor forward when an older value arrives later', async () => {
    await audit.advanceCursor('audit-event', new Date('2026-10-10T10:00:00Z'));
    await audit.advanceCursor('audit-event', new Date('2026-10-01T10:00:00Z'));

    expect(await audit.readCursor('audit-event')).toEqual(new Date('2026-10-10T10:00:00Z'));
  });

  describe('a hostile AuditEvent in the HAPI page (MJ-1: one bad entry must not freeze the journal)', () => {
    it('should reject the whole insert with a recognisable data error when a value overflows its column', async () => {
      const tooLong = { ...auditRow('ae-bad', '2026-10-08T10:00:00Z', 'u'.repeat(200), 'Appointment/apt-1') };

      const failure: unknown = await audit.insertMany([auditRow('ae-ok', '2026-10-08T09:00:00Z', 'user-1', 'Appointment/apt-0'), tooLong]).then(
        () => undefined,
        (error: unknown) => error,
      );

      expect(isRowRejection(failure)).toBe(true);
      expect((await audit.findPage({ range: OCTOBER }, { offset: 0, limit: 10 })).total).toBe(0);
    });

    it('should store a page whose fields are oversized and move the cursor when the mapper clips them', async () => {
      const hapi = hapiReturning([
        auditEvent('ae-1', '2026-10-08T10:00:00.000Z'),
        auditEvent('ae-long', '2026-10-08T10:01:00.000Z', {
          agent: [{ who: { identifier: { value: 'u'.repeat(300) } }, requestor: true }],
          source: { observer: { display: 's'.repeat(300) } },
          entity: [{ what: { reference: 'Appointment/apt-9' }, detail: [{ type: 'requestId', valueString: 'r'.repeat(300) }] }],
        }),
        auditEvent('ae-nul', '2026-10-08T10:02:00.000Z', {
          agent: [{ who: { identifier: { value: 'user\u0000-2' } }, requestor: true }],
        }),
      ]);

      const result = await new AuditSyncService(hapi, audit).syncOnce();

      const page = await audit.findPage({ range: OCTOBER }, { offset: 0, limit: 10 });
      expect(result).toEqual({ fetched: 3, stored: 3 });
      expect(page.rows.map((row) => row.id)).toEqual(['ae-nul', 'ae-long', 'ae-1']);
      expect(page.rows.find((row) => row.id === 'ae-long')).toMatchObject({ requestId: 'r'.repeat(128), source: 's'.repeat(128) });
      expect(page.rows.find((row) => row.id === 'ae-nul')?.userId).toBe('user-2');
      expect(await audit.readCursor(AUDIT_CURSOR)).toEqual(new Date('2026-10-08T10:02:00.000Z'));
    });

    it('should store the rest of the page and move the cursor when one entry still cannot be stored', async () => {
      // Passes the mapper (a valid JS instant) but is before PostgreSQL's earliest timestamp (4713 BC): SQLSTATE 22008.
      const unstorable = auditEvent('ae-poison', '2026-10-08T10:01:00.000Z', { recorded: '-271821-04-20T00:00:00.000Z' });
      const hapi = hapiReturning([
        auditEvent('ae-1', '2026-10-08T10:00:00.000Z'),
        unstorable,
        auditEvent('ae-3', '2026-10-08T10:02:00.000Z'),
      ]);

      const result = await new AuditSyncService(hapi, audit).syncOnce();

      const page = await audit.findPage({ range: OCTOBER }, { offset: 0, limit: 10 });
      expect(result).toEqual({ fetched: 3, stored: 2 });
      expect(page.rows.map((row) => row.id)).toEqual(['ae-3', 'ae-1']);
      expect(await audit.readCursor(AUDIT_CURSOR)).toEqual(new Date('2026-10-08T10:02:00.000Z'));
    });
  });
});
