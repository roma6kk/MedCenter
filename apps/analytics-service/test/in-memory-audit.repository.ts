import type {
  AuditEventRow,
  AuditFilter,
  AuditPage,
  AuditRepository,
  PageWindow,
} from '../src/modules/audit/audit.repository';

function matches(row: AuditEventRow, filter: AuditFilter): boolean {
  const time = row.occurredAt.getTime();
  return (
    time >= filter.range.from.getTime() &&
    time < filter.range.toExclusive.getTime() &&
    (filter.userId === undefined || row.userId === filter.userId) &&
    (filter.resourceType === undefined || row.resourceType === filter.resourceType) &&
    (filter.resourceId === undefined || row.resourceId === filter.resourceId)
  );
}

function newestFirst(left: AuditEventRow, right: AuditEventRow): number {
  const byTime = right.occurredAt.getTime() - left.occurredAt.getTime();
  return byTime !== 0 ? byTime : right.id.localeCompare(left.id);
}

/**
 * Same contract as `TypeOrmAuditRepository` (insert-or-ignore by id, newest
 * first, forward-only cursor) over a Map, so the HTTP suites run without
 * PostgreSQL. The SQL itself is covered by `read-model.e2e-spec.ts`.
 */
export class InMemoryAuditRepository implements AuditRepository {
  readonly rows = new Map<string, AuditEventRow>();
  private readonly cursors = new Map<string, Date>();

  async findPage(filter: AuditFilter, window: PageWindow): Promise<AuditPage> {
    const selected = [...this.rows.values()].filter((row) => matches(row, filter)).sort(newestFirst);
    return { rows: selected.slice(window.offset, window.offset + window.limit), total: selected.length };
  }

  async insertMany(rows: ReadonlyArray<AuditEventRow>): Promise<void> {
    for (const row of rows) {
      if (!this.rows.has(row.id)) {
        this.rows.set(row.id, row);
      }
    }
  }

  async readCursor(name: string): Promise<Date | null> {
    return this.cursors.get(name) ?? null;
  }

  async advanceCursor(name: string, value: Date): Promise<void> {
    const current = this.cursors.get(name);
    if (current === undefined || value > current) {
      this.cursors.set(name, value);
    }
  }
}
