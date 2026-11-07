import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AuditReadActions1761120000000 implements MigrationInterface {
  public readonly name = 'AuditReadActions1761120000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "analytics"."audit_event" DROP CONSTRAINT IF EXISTS "audit_event_action_check"');
    await queryRunner.query(`ALTER TABLE "analytics"."audit_event" ADD CONSTRAINT "audit_event_action_check"
      CHECK ("action" IN ('create', 'update', 'delete', 'read', 'denied'))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "analytics"."audit_event" WHERE "action" IN ('read', 'denied')`);
    await queryRunner.query('ALTER TABLE "analytics"."audit_event" DROP CONSTRAINT IF EXISTS "audit_event_action_check"');
    await queryRunner.query(`ALTER TABLE "analytics"."audit_event" ADD CONSTRAINT "audit_event_action_check"
      CHECK ("action" IN ('create', 'update', 'delete'))`);
  }
}
