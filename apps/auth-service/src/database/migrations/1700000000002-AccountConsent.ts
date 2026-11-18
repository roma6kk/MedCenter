import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountConsent1700000000002 implements MigrationInterface {
  public readonly name = 'AccountConsent1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "auth"."user" ADD COLUMN IF NOT EXISTS "account_consent_at" TIMESTAMPTZ NULL, ADD COLUMN IF NOT EXISTS "account_consent_version" VARCHAR(64) NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "auth"."user" DROP COLUMN IF EXISTS "account_consent_version", DROP COLUMN IF EXISTS "account_consent_at"',
    );
  }
}
