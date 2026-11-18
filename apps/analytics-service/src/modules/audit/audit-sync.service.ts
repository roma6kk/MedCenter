import { Inject, Injectable, Logger } from '@nestjs/common';
import { FHIR_CLIENT, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { lastUpdatedOf, toAuditEventRow } from './audit-event.mapper';
import { AUDIT_REPOSITORY, isRowRejection, type AuditEventRow, type AuditRepository } from './audit.repository';

export const AUDIT_CURSOR = 'audit-event';
export const AUDIT_SYNC_PAGE_SIZE = 200;

// Re-read window behind the cursor: HAPI stamps meta.lastUpdated before commit, so a late commit can carry an older timestamp.
export const AUDIT_SYNC_OVERLAP_MS = 60_000;

const AUDIT_SYNC_MAX_PAGES = 25;

const EPOCH = new Date(0);

interface AuditSyncResult {
  readonly fetched: number;
  readonly stored: number;
}

interface PageOutcome {
  readonly fetched: number;
  readonly stored: number;
  readonly newest: Date | undefined;
}

function newestOf(resources: ReadonlyArray<FhirResource>): Date | undefined {
  return resources.reduce<Date | undefined>((newest, resource) => {
    const stamp = lastUpdatedOf(resource);
    return stamp !== undefined && (newest === undefined || stamp > newest) ? stamp : newest;
  }, undefined);
}

@Injectable()
export class AuditSyncService {
  private readonly logger = new Logger(AuditSyncService.name);

  constructor(
    @Inject(FHIR_CLIENT) private readonly fhir: FhirClient,
    @Inject(AUDIT_REPOSITORY) private readonly repository: AuditRepository,
  ) {}

  async syncOnce(): Promise<AuditSyncResult> {
    const cursor = (await this.repository.readCursor(AUDIT_CURSOR)) ?? EPOCH;
    const lowerBound = new Date(Math.max(cursor.getTime() - AUDIT_SYNC_OVERLAP_MS, 0));
    let fetched = 0;
    let stored = 0;
    for (let page = 0; page < AUDIT_SYNC_MAX_PAGES; page += 1) {
      const outcome = await this.syncPage(lowerBound, page * AUDIT_SYNC_PAGE_SIZE);
      fetched += outcome.fetched;
      stored += outcome.stored;
      if (outcome.newest !== undefined) {
        await this.repository.advanceCursor(AUDIT_CURSOR, outcome.newest);
      }
      if (outcome.fetched < AUDIT_SYNC_PAGE_SIZE) {
        break;
      }
    }
    if (fetched > 0) {
      this.logger.log({ fetched, stored }, 'audit journal synchronised from HAPI');
    }
    return { fetched, stored };
  }

  private async syncPage(lowerBound: Date, offset: number): Promise<PageOutcome> {
    const bundle = await this.fhir.search('AuditEvent', {
      _lastUpdated: `ge${lowerBound.toISOString()}`,
      _sort: '_lastUpdated',
      _count: AUDIT_SYNC_PAGE_SIZE,
      _offset: offset,
    });
    const resources = (bundle.entry ?? []).map((entry) => entry.resource);
    const rows = resources.map(toAuditEventRow).filter((row): row is AuditEventRow => row !== undefined);
    return { fetched: resources.length, stored: await this.store(rows), newest: newestOf(resources) };
  }

  // On a data error of the page rows go one by one and only unstorable ones are dropped, so a poisoned entry cannot pin the cursor. An outage propagates.
  private async store(rows: ReadonlyArray<AuditEventRow>): Promise<number> {
    if (rows.length === 0) {
      return 0;
    }
    try {
      await this.repository.insertMany(rows);
      return rows.length;
    } catch (error) {
      if (!isRowRejection(error)) {
        throw error;
      }
      this.logger.warn({ err: error, rows: rows.length }, 'journal page rejected by the database; storing it row by row');
      return this.storeEach(rows);
    }
  }

  private async storeEach(rows: ReadonlyArray<AuditEventRow>): Promise<number> {
    let stored = 0;
    for (const row of rows) {
      try {
        await this.repository.insertMany([row]);
        stored += 1;
      } catch (error) {
        if (!isRowRejection(error)) {
          throw error;
        }
        this.logger.error({ err: error, auditEventId: row.id }, 'AuditEvent cannot be stored in the journal; skipping it');
      }
    }
    return stored;
  }
}
