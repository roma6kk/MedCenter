import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { FhirClientError } from '@medcenter/fhir';

import type { AuditService } from '../../audit/audit.service';
import { InMemoryTerminologyCache } from '../terminology-cache';
import { EXPANSION_CACHE_PREFIX } from '../terminology.service';
import { InMemoryImportLock, type ImportLock } from './import-lock';
import type { ImportSummary, SnapshotImporter } from './snapshot-importer';
import { SNAPSHOT_VERSION } from './snapshot-resources';
import { SnapshotVerificationError } from './snapshot-verifier';
import { TerminologyImportService } from './terminology-import.service';

const ACTOR = { sub: 'admin-1', requestId: 'req-1' } as const;
const SUMMARY: ImportSummary = {
  snapshotVersion: SNAPSHOT_VERSION,
  created: 2,
  updated: 7,
  resources: ['CodeSystem/cs-atc', 'ValueSet/vs-atc'],
  expansions: [],
};

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function build(lock: ImportLock = new InMemoryImportLock()): {
  readonly service: TerminologyImportService;
  readonly importer: jest.Mocked<Pick<SnapshotImporter, 'run'>>;
  readonly audit: jest.Mocked<Pick<AuditService, 'recordTerminologyImport'>>;
  readonly cache: InMemoryTerminologyCache;
} {
  const importer = { run: jest.fn().mockResolvedValue(SUMMARY) } as jest.Mocked<Pick<SnapshotImporter, 'run'>>;
  const audit = { recordTerminologyImport: jest.fn().mockResolvedValue(undefined) } as jest.Mocked<
    Pick<AuditService, 'recordTerminologyImport'>
  >;
  const cache = new InMemoryTerminologyCache();
  const service = new TerminologyImportService(importer as unknown as SnapshotImporter, audit as unknown as AuditService, lock, cache);
  return { service, importer, audit, cache };
}

describe('TerminologyImportService', () => {
  describe('start', () => {
    it('should answer ACCEPTED with an import id when a bundled snapshot is requested', async () => {
      const { service } = build();

      const accepted = await service.start(SNAPSHOT_VERSION, ACTOR);

      expect(accepted).toMatchObject({ snapshotVersion: SNAPSHOT_VERSION, status: 'ACCEPTED' });
      expect(accepted.importId).toMatch(/^[0-9a-f-]{36}$/);
      await service.whenIdle();
    });

    it('should answer 422 TERMINOLOGY_NOT_FOUND without touching the lock or HAPI when the snapshot is not bundled', async () => {
      const { service, importer, audit } = build();

      const attempt = service.start('9.9.9', ACTOR);

      await expect(attempt).rejects.toBeInstanceOf(UnprocessableEntityException);
      await expect(attempt).rejects.toMatchObject({ response: { errorCode: 'TERMINOLOGY_NOT_FOUND' } });
      expect(importer.run).not.toHaveBeenCalled();
      expect(audit.recordTerminologyImport).not.toHaveBeenCalled();
    });

    it('should audit the accepted import before the job starts when the request is accepted', async () => {
      const { service, importer, audit } = build();
      const runsWhenAudited: number[] = [];
      audit.recordTerminologyImport.mockImplementation(async () => {
        runsWhenAudited.push(importer.run.mock.calls.length);
      });

      const accepted = await service.start(SNAPSHOT_VERSION, ACTOR);
      await service.whenIdle();

      expect(runsWhenAudited[0]).toBe(0);

      expect(audit.recordTerminologyImport).toHaveBeenNthCalledWith(1, {
        stage: 'started',
        actor: ACTOR,
        snapshotVersion: SNAPSHOT_VERSION,
        importId: accepted.importId,
      });
    });

    it('should answer 409 CONFLICT when another import is still running', async () => {
      const { service, importer } = build();
      const running = deferred<ImportSummary>();
      importer.run.mockReturnValue(running.promise);
      await service.start(SNAPSHOT_VERSION, ACTOR);

      const second = service.start(SNAPSHOT_VERSION, ACTOR);

      await expect(second).rejects.toBeInstanceOf(ConflictException);
      await expect(second).rejects.toMatchObject({ response: { errorCode: 'CONFLICT' } });
      expect(importer.run).toHaveBeenCalledTimes(1);
      running.resolve(SUMMARY);
      await service.whenIdle();
    });

    it('should accept a new import when the previous one has finished', async () => {
      const { service, importer } = build();
      await service.start(SNAPSHOT_VERSION, ACTOR);
      await service.whenIdle();

      await expect(service.start(SNAPSHOT_VERSION, ACTOR)).resolves.toMatchObject({ status: 'ACCEPTED' });

      await service.whenIdle();
      expect(importer.run).toHaveBeenCalledTimes(2);
    });

    it('should propagate the failure when the lock cannot be taken', async () => {
      const broken: ImportLock = { acquire: jest.fn().mockRejectedValue(new Error('redis down')) };
      const { service, importer } = build(broken);

      await expect(service.start(SNAPSHOT_VERSION, ACTOR)).rejects.toThrow('redis down');
      expect(importer.run).not.toHaveBeenCalled();
    });

    it('should not answer before the import finishes when the job is slow', async () => {
      const { service, importer } = build();
      const running = deferred<ImportSummary>();
      importer.run.mockReturnValue(running.promise);

      await service.start(SNAPSHOT_VERSION, ACTOR);

      let isIdle = false;
      void service.whenIdle().then(() => {
        isIdle = true;
      });
      await Promise.resolve();
      expect(isIdle).toBe(false);
      running.resolve(SUMMARY);
      await service.whenIdle();
      expect(isIdle).toBe(true);
    });
  });

  describe('the background job', () => {
    it('should audit completion with the written resources and sweep the cache when the import succeeds', async () => {
      const { service, audit, cache } = build();
      await cache.set(`${EXPANSION_CACHE_PREFIX}:page`, 'stale', 60);
      await cache.set('other:key', 'kept', 60);

      const accepted = await service.start(SNAPSHOT_VERSION, ACTOR);
      await service.whenIdle();

      expect(audit.recordTerminologyImport).toHaveBeenLastCalledWith({
        stage: 'completed',
        actor: ACTOR,
        snapshotVersion: SNAPSHOT_VERSION,
        importId: accepted.importId,
        resourceRefs: SUMMARY.resources,
      });
      expect(await cache.get(`${EXPANSION_CACHE_PREFIX}:page`)).toBeNull();
      expect(await cache.get('other:key')).toBe('kept');
    });

    it('should audit a failure without echoing internals when HAPI refuses a write', async () => {
      const { service, importer, audit } = build();
      importer.run.mockRejectedValue(new FhirClientError('PUT', 'http://hapi:8080/fhir/ValueSet/x', 500, 'stack'));

      await service.start(SNAPSHOT_VERSION, ACTOR);
      await service.whenIdle();

      const failed = audit.recordTerminologyImport.mock.calls.at(-1)?.[0];
      expect(failed).toMatchObject({ stage: 'failed', failure: 'HAPI request failed (status 500)' });
      expect(JSON.stringify(failed)).not.toContain('hapi:8080');
    });

    it('should audit the verification reason when the snapshot is written but not served', async () => {
      const { service, importer, audit } = build();
      importer.run.mockRejectedValue(new SnapshotVerificationError('ValueSet expansion is incomplete: x lacks A01'));

      await service.start(SNAPSHOT_VERSION, ACTOR);
      await service.whenIdle();

      expect(audit.recordTerminologyImport.mock.calls.at(-1)?.[0]).toMatchObject({
        stage: 'failed',
        failure: 'ValueSet expansion is incomplete: x lacks A01',
      });
    });

    it('should hide an unexpected error behind a generic reason when the job crashes', async () => {
      const { service, importer, audit } = build();
      importer.run.mockRejectedValue(new TypeError('secret detail'));

      await service.start(SNAPSHOT_VERSION, ACTOR);
      await service.whenIdle();

      expect(audit.recordTerminologyImport.mock.calls.at(-1)?.[0]).toMatchObject({
        stage: 'failed',
        failure: 'import failed; see the service log',
      });
    });

    it('should release the lock and sweep the cache when the import fails', async () => {
      const { service, importer, cache } = build();
      await cache.set(`${EXPANSION_CACHE_PREFIX}:page`, 'stale', 60);
      importer.run.mockRejectedValueOnce(new Error('boom'));
      await service.start(SNAPSHOT_VERSION, ACTOR);
      await service.whenIdle();

      expect(await cache.get(`${EXPANSION_CACHE_PREFIX}:page`)).toBeNull();
      await expect(service.start(SNAPSHOT_VERSION, ACTOR)).resolves.toMatchObject({ status: 'ACCEPTED' });
      await service.whenIdle();
    });

    it('should never reject whenIdle when the job fails', async () => {
      const { service, importer } = build();
      importer.run.mockRejectedValue(new Error('boom'));

      await service.start(SNAPSHOT_VERSION, ACTOR);

      await expect(service.whenIdle()).resolves.toBeUndefined();
    });
  });
});
