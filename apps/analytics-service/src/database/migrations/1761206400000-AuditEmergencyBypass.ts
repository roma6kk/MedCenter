import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR-019: the journal also shows the emergency bypass of the consent rule (7.1/7.3 with `emergencyReason`). It is the
 * `emergency-bypass` action and carries the doctor's reason in a new nullable `reason` column.
 */
export class AuditEmergencyBypass1761206400000 implements MigrationInterface {
  public readonly name = 'AuditEmergencyBypass1761206400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "analytics"."audit_event" ADD COLUMN IF NOT EXISTS "reason" varchar(500)');
    await queryRunner.query('ALTER TABLE "analytics"."audit_event" DROP CONSTRAINT IF EXISTS "audit_event_action_check"');
    await queryRunner.query(`ALTER TABLE "analytics"."audit_event" ADD CONSTRAINT "audit_event_action_check"
      CHECK ("action" IN ('create', 'update', 'delete', 'read', 'denied', 'emergency-bypass'))`);
  }

  /** The bypass rows are a copy of HAPI's AuditEvents: dropping them loses nothing, the sync restores them. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "analytics"."audit_event" WHERE "action" = 'emergency-bypass'`);
    await queryRunner.query('ALTER TABLE "analytics"."audit_event" DROP CONSTRAINT IF EXISTS "audit_event_action_check"');
    await queryRunner.query('ALTER TABLE "analytics"."audit_event" DROP COLUMN IF EXISTS "reason"');
    await queryRunner.query(`ALTER TABLE "analytics"."audit_event" ADD CONSTRAINT "audit_event_action_check"
      CHECK ("action" IN ('create', 'update', 'delete', 'read', 'denied'))`);
  }
}
