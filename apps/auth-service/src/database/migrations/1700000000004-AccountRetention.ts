import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountRetention1700000000004 implements MigrationInterface {
  public readonly name = 'AccountRetention1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "auth"."user" ADD COLUMN IF NOT EXISTS "closed_at" TIMESTAMPTZ NULL');
    await queryRunner.query('ALTER TABLE "auth"."user" ADD COLUMN IF NOT EXISTS "retention_until" TIMESTAMPTZ NULL');
    await queryRunner.query(
      `UPDATE "auth"."user" SET "closed_at" = COALESCE("account_consent_withdrawn_at", "updated_at"),
        "retention_until" = COALESCE("account_consent_withdrawn_at", "updated_at") + INTERVAL '1825 days'
        WHERE "is_active" = false AND "closed_at" IS NULL`,
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "ix_user_retention_until" ON "auth"."user" ("retention_until") WHERE "retention_until" IS NOT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "auth"."ix_user_retention_until"');
    await queryRunner.query('ALTER TABLE "auth"."user" DROP COLUMN IF EXISTS "retention_until"');
    await queryRunner.query('ALTER TABLE "auth"."user" DROP COLUMN IF EXISTS "closed_at"');
  }
}
