import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountConsentWithdrawal1700000000003 implements MigrationInterface {
  public readonly name = 'AccountConsentWithdrawal1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "auth"."user" ADD COLUMN IF NOT EXISTS "account_consent_withdrawn_at" TIMESTAMPTZ NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "auth"."user" DROP COLUMN IF EXISTS "account_consent_withdrawn_at"');
  }
}
