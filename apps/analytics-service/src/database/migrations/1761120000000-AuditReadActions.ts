import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR-018 (D-3): the journal also holds reads of patient data. `read` is a
 * successful read by a doctor or administrator, `denied` a read refused by the
 * compartment rule. Only the CHECK of `audit_event.action` changes.
 */
export class AuditReadActions1761120000000 implements MigrationInterface {
  public readonly name = 'AuditReadActions1761120000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "analytics"."audit_event" DROP CONSTRAINT IF EXISTS "audit_event_action_check"');
    await queryRunner.query(`ALTER TABLE "analytics"."audit_event" ADD CONSTRAINT "audit_event_action_check"
      CHECK ("action" IN ('create', 'update', 'delete', 'read', 'denied'))`);
  }

  /** The read rows are a copy of HAPI's AuditEvents: dropping them loses nothing, the sync restores them. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "analytics"."audit_event" WHERE "action" IN ('read', 'denied')`);
    await queryRunner.query('ALTER TABLE "analytics"."audit_event" DROP CONSTRAINT IF EXISTS "audit_event_action_check"');
    await queryRunner.query(`ALTER TABLE "analytics"."audit_event" ADD CONSTRAINT "audit_event_action_check"
      CHECK ("action" IN ('create', 'update', 'delete'))`);
  }
}
