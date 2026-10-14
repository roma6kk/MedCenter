import { Logger } from '@nestjs/common';
import type { FhirClient, FhirResource } from '@medcenter/fhir';

import type { AuditEventRow, AuditRepository } from './audit.repository';
import { AUDIT_CURSOR, AUDIT_SYNC_OVERLAP_MS, AUDIT_SYNC_PAGE_SIZE, AuditSyncService } from './audit-sync.service';

function auditEvent(id: string, lastUpdated: string): FhirResource {
  return {
    resourceType: 'AuditEvent',
    id,
    meta: { lastUpdated },
    action: 'C',
    recorded: lastUpdated,
    agent: [{ who: { identifier: { value: 'user-1' } }, requestor: true }],
    entity: [{ what: { reference: `Appointment/${id}` } }],
  };
}

/** What the `pg` driver reports through TypeORM's `QueryFailedError` for a rejected value. */
function sqlError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function bundleOf(resources: ReadonlyArray<FhirResource>): { entry: Array<{ resource: FhirResource }> } {
  return { entry: resources.map((resource) => ({ resource })) };
}

describe('AuditSyncService', () => {
  let fhir: jest.Mocked<FhirClient>;
  let repository: jest.Mocked<AuditRepository>;
  let sync: AuditSyncService;

  beforeEach(() => {
    fhir = {
      search: jest.fn().mockResolvedValue({ entry: [] }),
      read: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      operation: jest.fn(),
      batch: jest.fn(),
    } as unknown as jest.Mocked<FhirClient>;
    repository = {
      findPage: jest.fn(),
      insertMany: jest.fn().mockResolvedValue(undefined),
      readCursor: jest.fn().mockResolvedValue(null),
      advanceCursor: jest.fn().mockResolvedValue(undefined),
    };
    sync = new AuditSyncService(fhir, repository);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should pull from the epoch, oldest first, when no cursor was stored yet', async () => {
    await sync.syncOnce();

    expect(fhir.search).toHaveBeenCalledWith('AuditEvent', {
      _lastUpdated: 'ge1970-01-01T00:00:00.000Z',
      _sort: '_lastUpdated',
      _count: AUDIT_SYNC_PAGE_SIZE,
      _offset: 0,
    });
  });

  it('should re-read an overlap window behind the cursor when a late commit must not be missed', async () => {
    repository.readCursor.mockResolvedValue(new Date('2026-10-08T10:00:00.000Z'));

    await sync.syncOnce();

    const lowerBound = new Date(Date.parse('2026-10-08T10:00:00.000Z') - AUDIT_SYNC_OVERLAP_MS).toISOString();
    expect(fhir.search).toHaveBeenCalledWith('AuditEvent', expect.objectContaining({ _lastUpdated: `ge${lowerBound}` }));
  });

  it('should store the mapped rows and advance the cursor to the newest lastUpdated when events arrive', async () => {
    fhir.search.mockResolvedValueOnce(
      bundleOf([auditEvent('ae-1', '2026-10-08T10:00:00.000Z'), auditEvent('ae-2', '2026-10-08T10:05:00.000Z')]),
    );

    const result = await sync.syncOnce();

    const stored = repository.insertMany.mock.calls[0]?.[0] as ReadonlyArray<AuditEventRow>;
    expect(stored.map((row) => row.id)).toEqual(['ae-1', 'ae-2']);
    expect(repository.advanceCursor).toHaveBeenCalledWith(AUDIT_CURSOR, new Date('2026-10-08T10:05:00.000Z'));
    expect(result).toEqual({ fetched: 2, stored: 2 });
  });

  it('should follow offset pages until a short page when a page comes back full', async () => {
    const fullPage = Array.from({ length: AUDIT_SYNC_PAGE_SIZE }, (_, index) =>
      auditEvent(`ae-${index}`, '2026-10-08T10:00:00.000Z'),
    );
    fhir.search.mockResolvedValueOnce(bundleOf(fullPage)).mockResolvedValueOnce(bundleOf([auditEvent('ae-last', '2026-10-08T11:00:00.000Z')]));

    await sync.syncOnce();

    expect(fhir.search).toHaveBeenCalledTimes(2);
    expect(fhir.search).toHaveBeenLastCalledWith('AuditEvent', expect.objectContaining({ _offset: AUDIT_SYNC_PAGE_SIZE }));
    expect(repository.advanceCursor).toHaveBeenCalledWith(AUDIT_CURSOR, new Date('2026-10-08T11:00:00.000Z'));
  });

  it('should keep the cursor unchanged when HAPI has nothing new', async () => {
    await sync.syncOnce();

    expect(repository.insertMany).not.toHaveBeenCalled();
    expect(repository.advanceCursor).not.toHaveBeenCalled();
  });

  it('should not advance the cursor when storing a page fails, so the next run retries it', async () => {
    fhir.search.mockResolvedValueOnce(bundleOf([auditEvent('ae-1', '2026-10-08T10:00:00.000Z')]));
    repository.insertMany.mockRejectedValueOnce(new Error('db down'));

    await expect(sync.syncOnce()).rejects.toThrow('db down');
    expect(repository.advanceCursor).not.toHaveBeenCalled();
  });

  it('should advance past events it cannot map when read events arrive, storing only journal rows', async () => {
    const readEvent = { ...auditEvent('ae-r', '2026-10-08T12:00:00.000Z'), action: 'R' };
    fhir.search.mockResolvedValueOnce(bundleOf([auditEvent('ae-1', '2026-10-08T10:00:00.000Z'), readEvent]));

    const result = await sync.syncOnce();

    expect(result).toEqual({ fetched: 2, stored: 1 });
    expect(repository.advanceCursor).toHaveBeenCalledWith(AUDIT_CURSOR, new Date('2026-10-08T12:00:00.000Z'));
  });

  describe('when PostgreSQL rejects the data of a page', () => {
    const POISONED = 'ae-poison';
    let error: jest.SpyInstance;

    beforeEach(() => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      fhir.search.mockResolvedValueOnce(
        bundleOf([
          auditEvent('ae-1', '2026-10-08T10:00:00.000Z'),
          auditEvent(POISONED, '2026-10-08T10:01:00.000Z'),
          auditEvent('ae-3', '2026-10-08T10:02:00.000Z'),
        ]),
      );
      repository.insertMany.mockImplementation(async (rows) => {
        if (rows.some((row) => row.id === POISONED)) {
          throw sqlError('22001', 'value too long for type character varying(128)');
        }
      });
    });

    it('should store the good rows one by one and skip only the poisoned one when a page fails on data', async () => {
      const result = await sync.syncOnce();

      const stored = repository.insertMany.mock.calls.filter(([rows]) => rows.length === 1 && rows[0]?.id !== POISONED);
      expect(stored.map(([rows]) => rows[0]?.id)).toEqual(['ae-1', 'ae-3']);
      expect(result).toEqual({ fetched: 3, stored: 2 });
    });

    it('should advance the cursor past the poisoned entry when a page fails on data, so the journal does not freeze', async () => {
      await sync.syncOnce();

      expect(repository.advanceCursor).toHaveBeenCalledWith(AUDIT_CURSOR, new Date('2026-10-08T10:02:00.000Z'));
    });

    it('should log the id of the skipped AuditEvent when a single row cannot be stored', async () => {
      await sync.syncOnce();

      expect(error).toHaveBeenCalledWith(expect.objectContaining({ auditEventId: POISONED }), expect.stringContaining('skipping'));
    });

    it('should treat a constraint violation like a data error when the row breaks a CHECK', async () => {
      repository.insertMany.mockImplementation(async (rows) => {
        if (rows.some((row) => row.id === POISONED)) {
          throw sqlError('23514', 'violates check constraint');
        }
      });

      const result = await sync.syncOnce();

      expect(result.stored).toBe(2);
    });
  });

  it('should keep the cursor and rethrow when the database is down, instead of skipping rows as if they were bad', async () => {
    fhir.search.mockResolvedValueOnce(bundleOf([auditEvent('ae-1', '2026-10-08T10:00:00.000Z')]));
    repository.insertMany.mockRejectedValue(sqlError('ECONNREFUSED', 'connect ECONNREFUSED'));

    await expect(sync.syncOnce()).rejects.toThrow('ECONNREFUSED');
    expect(repository.insertMany).toHaveBeenCalledTimes(1);
    expect(repository.advanceCursor).not.toHaveBeenCalled();
  });

  it('should keep the cursor and rethrow when the database fails midway through the row-by-row retry', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    fhir.search.mockResolvedValueOnce(
      bundleOf([auditEvent('ae-1', '2026-10-08T10:00:00.000Z'), auditEvent('ae-2', '2026-10-08T10:01:00.000Z')]),
    );
    repository.insertMany
      .mockRejectedValueOnce(sqlError('22001', 'value too long'))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(sqlError('57P01', 'terminating connection due to administrator command'));

    await expect(sync.syncOnce()).rejects.toThrow('terminating connection');
    expect(repository.advanceCursor).not.toHaveBeenCalled();
  });
});
