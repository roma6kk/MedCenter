import type { AuditAction } from '../../../database/entities/audit-event-read.entity';

export interface AuditEventDto {
  readonly id: string;
  readonly occurredAt: string;
  readonly userId: string;
  readonly action: AuditAction;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly requestId: string;
  readonly reason?: string;
}
