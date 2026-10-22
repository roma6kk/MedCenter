import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Self-registration records the account holder's consent to the processing of the account
 * data (art. 5, Law 99-Z): when it was given and under which text version. Both columns are
 * nullable: accounts created by an administrator (API 2.2.1) and those that existed before
 * this migration have no such tick. This is not the consent to the electronic medical
 * record, which lives in FHIR (ADR-019).
 */
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
