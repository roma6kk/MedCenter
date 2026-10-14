import type { AuditAction } from '../../../database/entities/audit-event-read.entity';

/**
 * API §9.4 journal row. Missing values are empty strings, never `null`, so the
 * admin table (`audit-table.tsx`) can render every column as text.
 */
export interface AuditEventDto {
  readonly id: string;
  readonly occurredAt: string;
  readonly userId: string;
  readonly action: AuditAction;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly requestId: string;
}
