import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AuditAuthenticationActions1763078400000 implements MigrationInterface {
  public readonly name = 'AuditAuthenticationActions1763078400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "analytics"."audit_event" DROP CONSTRAINT IF EXISTS "audit_event_action_check"');
    await queryRunner.query(`ALTER TABLE "analytics"."audit_event" ADD CONSTRAINT "audit_event_action_check"
      CHECK ("action" IN ('create', 'update', 'delete', 'read', 'denied', 'emergency-bypass', 'login', 'login-failed', 'login-throttled', 'logout', 'session-idle'))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "analytics"."audit_event" WHERE "action" IN ('login', 'login-failed', 'login-throttled', 'logout', 'session-idle')`);
    await queryRunner.query('ALTER TABLE "analytics"."audit_event" DROP CONSTRAINT IF EXISTS "audit_event_action_check"');
    await queryRunner.query(`ALTER TABLE "analytics"."audit_event" ADD CONSTRAINT "audit_event_action_check"
      CHECK ("action" IN ('create', 'update', 'delete', 'read', 'denied', 'emergency-bypass'))`);
  }
}
