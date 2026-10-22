import { Column, Entity, PrimaryColumn } from 'typeorm';

import { ANALYTICS_SCHEMA } from '../analytics-schema';

/**
 * `AuditEvent.action` values the journal exposes (API §9.4): writes, plus `read` (a doctor's or administrator's read
 * of patient data) and `denied` (a read refused by the compartment rule), ADR-018.
 */
export type AuditAction = 'create' | 'update' | 'delete' | 'read' | 'denied';

/**
 * Read-model copy of a FHIR `AuditEvent` (ADR-014). HAPI stays the system of
 * record; this table exists because HAPI cannot filter the journal by user
 * (`agent.who.identifier` is not searchable) or by resource type.
 */
@Entity({ name: 'audit_event', schema: ANALYTICS_SCHEMA })
export class AuditEventReadEntity {
  /** `AuditEvent.id` in HAPI. */
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
}
