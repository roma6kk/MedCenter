import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { FhirClientError } from '@medcenter/fhir';

import type { AuditActor } from '../../audit/audit-event.builder';
import { AuditService } from '../../audit/audit.service';
import { TERMINOLOGY_CACHE, type TerminologyCache } from '../terminology-cache';
import { EXPANSION_CACHE_PREFIX } from '../terminology.service';
import type { ImportAcceptedDto } from './dto/import-response.dto';
import { IMPORT_LOCK, type ImportLease, type ImportLock } from './import-lock';
import { importAlreadyRunning, snapshotNotBundled } from './import-errors';
import { SnapshotImporter } from './snapshot-importer';
import { SNAPSHOT_VERSION } from './snapshot-resources';
import { SnapshotVerificationError } from './snapshot-verifier';

export const IMPORT_LOCK_TTL_SECONDS = 1800;

const UNKNOWN_FAILURE = 'import failed; see the service log';

/** A reason safe to store in the audit trail: no HAPI URL, no stack, no input echo. */
function failureReason(error: unknown): string {
  if (error instanceof SnapshotVerificationError) {
    return error.message;
  }
  if (error instanceof FhirClientError) {
    return `HAPI request failed (status ${error.upstreamStatus ?? 'none'})`;
  }
  return UNKNOWN_FAILURE;
}

interface ImportRun {
  readonly accepted: ImportAcceptedDto;
  readonly actor: AuditActor;
  readonly lease: ImportLease;
}

@Injectable()
export class TerminologyImportService {
  private readonly logger = new Logger(TerminologyImportService.name);
  private running: Promise<void> = Promise.resolve();

  constructor(
    private readonly importer: SnapshotImporter,
    private readonly audit: AuditService,
    @Inject(IMPORT_LOCK) private readonly lock: ImportLock,
    @Inject(TERMINOLOGY_CACHE) private readonly cache: TerminologyCache,
  ) {}

  async start(snapshotVersion: string, actor: AuditActor): Promise<ImportAcceptedDto> {
    if (snapshotVersion !== SNAPSHOT_VERSION) {
      throw snapshotNotBundled(snapshotVersion);
    }
    const lease = await this.lock.acquire(IMPORT_LOCK_TTL_SECONDS);
    if (lease === null) {
      throw importAlreadyRunning();
    }
    const accepted: ImportAcceptedDto = {
      importId: randomUUID(),
      snapshotVersion,
      status: 'ACCEPTED',
      acceptedAt: new Date().toISOString(),
    };
    await this.audit.recordTerminologyImport({ stage: 'started', actor, snapshotVersion, importId: accepted.importId });
    this.running = this.execute({ accepted, actor, lease }).catch((error: unknown) => {
      // `execute` handles its own failures; this only keeps a bookkeeping defect from becoming an unhandled rejection.
      this.logger.error({ err: error, importId: accepted.importId }, 'Terminology import bookkeeping failed');
    });
    return accepted;
  }

  whenIdle(): Promise<void> {
    return this.running;
  }

  private async execute(run: ImportRun): Promise<void> {
    const { importId, snapshotVersion } = run.accepted;
    try {
      this.logger.log({ importId, snapshotVersion }, 'Terminology import started');
      const summary = await this.importer.run();
      await this.record(run, 'completed', { resourceRefs: summary.resources });
      this.logger.log({ importId, created: summary.created, updated: summary.updated }, 'Terminology import completed');
    } catch (error: unknown) {
      this.logger.error({ err: error, importId, snapshotVersion }, 'Terminology import failed');
      await this.record(run, 'failed', { failure: failureReason(error) });
    } finally {
      await this.cache.deleteByPrefix(EXPANSION_CACHE_PREFIX);
      await run.lease.release();
    }
  }

  private record(
    run: ImportRun,
    stage: 'completed' | 'failed',
    detail: { readonly resourceRefs?: ReadonlyArray<string>; readonly failure?: string },
  ): Promise<void> {
    return this.audit.recordTerminologyImport({
      stage,
      actor: run.actor,
      snapshotVersion: run.accepted.snapshotVersion,
      importId: run.accepted.importId,
      ...detail,
    });
  }
}
