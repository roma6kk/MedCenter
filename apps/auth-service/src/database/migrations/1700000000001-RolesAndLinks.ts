import { MigrationInterface, QueryRunner } from 'typeorm';

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
    // Seeded roles stay: `user_role` references them, deleting would cascade away every account's role.
  }
}
