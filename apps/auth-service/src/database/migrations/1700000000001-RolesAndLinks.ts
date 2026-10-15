import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Task 7 (users) — what the Init schema left to the application:
 *
 * - the RBAC catalogue (`PATIENT`, `DOCTOR`, `ADMIN`) is seeded, because
 *   `user_role` references `role` rows that nothing else ever inserts;
 * - one FHIR resource can be linked to **one** user only. A second account
 *   linked to the same `PractitionerRole` would receive the same `fhirUser`
 *   claim and act as that doctor (ADR-013), so the pair
 *   `(resource_type, resource_id)` is unique;
 * - emails are unique case-insensitively, so `Ivanov@x.by` can never shadow
 *   `ivanov@x.by` even if a writer forgets to normalise.
 *
 * Every statement is idempotent so a half-applied run can be retried.
 */
export class RolesAndLinks1700000000001 implements MigrationInterface {
  public readonly name = 'RolesAndLinks1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "auth"."role" ("name", "description") VALUES
        ('PATIENT', 'Пациент'),
        ('DOCTOR', 'Врач'),
        ('ADMIN', 'Администратор')
      ON CONFLICT ("name") DO NOTHING`,
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "uq_external_link_resource" ON "auth"."external_link" ("resource_type", "resource_id")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_email_lower" ON "auth"."user" (lower("email"))',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "auth"."uq_user_email_lower"');
    await queryRunner.query('DROP INDEX IF EXISTS "auth"."uq_external_link_resource"');
    // The seeded roles stay: `user_role` references them, so deleting them would
    // cascade away the role of every account. They are reference data, not schema.
  }
}
