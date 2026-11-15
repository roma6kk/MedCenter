import { Column, Entity, PrimaryColumn } from 'typeorm';

import { ANALYTICS_SCHEMA } from '../analytics-schema';

export const AUDIT_ACTIONS = [
  'create',
  'update',
  'delete',
  'read',
  'denied',
  'emergency-bypass',
  'login',
  'login-failed',
  'login-throttled',
  'logout',
  'session-idle',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// Copy of FHIR AuditEvent: HAPI cannot filter the journal by user (agent.who.identifier) or by resource type.
@Entity({ name: 'audit_event', schema: ANALYTICS_SCHEMA })
export class AuditEventReadEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ name: 'user_id', type: 'varchar', length: 128, nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', length: 16 })
  action!: AuditAction;

  @Column({ name: 'resource_type', type: 'varchar', length: 64, nullable: true })
  resourceType!: string | null;

  @Column({ name: 'resource_id', type: 'varchar', length: 64, nullable: true })
  resourceId!: string | null;

  @Column({ name: 'request_id', type: 'varchar', length: 128, nullable: true })
  requestId!: string | null;

  @Column({ name: 'source', type: 'varchar', length: 128, nullable: true })
  source!: string | null;

  @Column({ name: 'reason', type: 'varchar', length: 500, nullable: true })
  reason!: string | null;
}
