import { Inject, Injectable } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { ANALYTICS_DATA_SOURCE } from '../../database/database.tokens';
import { AuditEventReadEntity, type AuditAction } from '../../database/entities/audit-event-read.entity';
import { SyncCursorEntity } from '../../database/entities/sync-cursor.entity';
import type { DateRange } from '../shared/date-range';

export interface AuditEventRow {
  readonly id: string;
  readonly occurredAt: Date;
  readonly userId: string | null;
  readonly action: AuditAction;
  readonly resourceType: string | null;
  readonly resourceId: string | null;
  readonly requestId: string | null;
  readonly source: string | null;
}

export interface AuditFilter {
  readonly range: DateRange;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly userId?: string;
}

export interface PageWindow {
  readonly offset: number;
  readonly limit: number;
}

export interface AuditPage {
  readonly rows: ReadonlyArray<AuditEventRow>;
  readonly total: number;
}

/**
 * Journal read-model (API §9.4) plus the sync high-water mark. The table is a
 * copy of HAPI's `AuditEvent`s and keeps every row it ever received: HAPI has
 * no AuditEvent retention job in this deployment, so there is nothing to
 * mirror (ADR-014 "retention follows HAPI"). When HAPI gains one, the copy
 * needs a matching purge — see `coder-m5-analytics-report.md`, "Fixes".
 */
export interface AuditRepository {
  findPage(filter: AuditFilter, window: PageWindow): Promise<AuditPage>;
  /** Insert-or-ignore by `AuditEvent.id`: AuditEvents are immutable, a re-read changes nothing. */
  insertMany(rows: ReadonlyArray<AuditEventRow>): Promise<void>;
  readCursor(name: string): Promise<Date | null>;
  /** Moves the cursor forward only (`GREATEST`), so concurrent replicas never rewind it. */
  advanceCursor(name: string, value: Date): Promise<void>;
}

export const AUDIT_REPOSITORY = Symbol('AUDIT_REPOSITORY');

/** PostgreSQL SQLSTATE of a data (class 22) or constraint (class 23) violation: the row is bad, not the database. */
const ROW_REJECTION_SQLSTATE = /^(22|23)[0-9A-Z]{3}$/;

/**
 * True when PostgreSQL refused the *data* of an insert — a value too long for
 * its column (`22001`), a NUL byte (`22021`), a timestamp out of range
 * (`22008`), a CHECK violation (`23514`) — as opposed to an outage (connection
 * refused, deadlock, shutdown), which a retry can cure. TypeORM's
 * `QueryFailedError` copies the driver's `code` onto itself.
 */
export function isRowRejection(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const { code, driverError } = error as { readonly code?: unknown; readonly driverError?: { readonly code?: unknown } };
  const sqlState = typeof code === 'string' ? code : driverError?.code;
  return typeof sqlState === 'string' && ROW_REJECTION_SQLSTATE.test(sqlState);
}

@Injectable()
export class TypeOrmAuditRepository implements AuditRepository {
  constructor(@Inject(ANALYTICS_DATA_SOURCE) private readonly dataSource: DataSource) {}

  async findPage(filter: AuditFilter, window: PageWindow): Promise<AuditPage> {
    const query = this.dataSource
      .getRepository(AuditEventReadEntity)
      .createQueryBuilder('audit')
      .where('audit.occurredAt >= :from AND audit.occurredAt < :toExclusive', filter.range);
    if (filter.userId !== undefined) {
      query.andWhere('audit.userId = :userId', { userId: filter.userId });
    }
    if (filter.resourceType !== undefined) {
      query.andWhere('audit.resourceType = :resourceType', { resourceType: filter.resourceType });
    }
    if (filter.resourceId !== undefined) {
      query.andWhere('audit.resourceId = :resourceId', { resourceId: filter.resourceId });
    }
    const [rows, total] = await query
      .orderBy('audit.occurredAt', 'DESC')
      .addOrderBy('audit.id', 'DESC')
      .offset(window.offset)
      .limit(window.limit)
      .getManyAndCount();
    return { rows, total };
  }

  async insertMany(rows: ReadonlyArray<AuditEventRow>): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    await this.dataSource
      .createQueryBuilder()
      .insert()
      .into(AuditEventReadEntity)
      .values(rows.map((row) => ({ ...row })))
      .orIgnore()
      .execute();
  }

  async readCursor(name: string): Promise<Date | null> {
    const cursor = await this.dataSource.getRepository(SyncCursorEntity).findOneBy({ name });
    return cursor?.cursorValue ?? null;
  }

  async advanceCursor(name: string, value: Date): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO "analytics"."sync_cursor" ("name", "cursor_value", "updated_at")
       VALUES ($1, $2, now())
       ON CONFLICT ("name") DO UPDATE
       SET "cursor_value" = GREATEST("sync_cursor"."cursor_value", EXCLUDED."cursor_value"), "updated_at" = now()`,
      [name, value],
    );
  }
}
