import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial `auth` schema: users, RBAC, the FHIR bridge and the OAuth store.
 * The unique index on `external_link(user_id, resource_type)` guarantees a
 * user links to at most one `Patient` and at most one `PractitionerRole`.
 */
export class Init1700000000000 implements MigrationInterface {
  public readonly name = 'Init1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE SCHEMA IF NOT EXISTS "auth"');

    await queryRunner.query(`CREATE TABLE "auth"."user" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "email" varchar(255) NOT NULL UNIQUE,
      "password_hash" varchar(255) NOT NULL,
      "first_name" varchar(100) NOT NULL,
      "last_name" varchar(100) NOT NULL,
      "is_active" boolean NOT NULL DEFAULT true,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )`);

    await queryRunner.query(`CREATE TABLE "auth"."role" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "name" varchar(50) NOT NULL UNIQUE,
      "description" varchar(255),
      "created_at" timestamptz NOT NULL DEFAULT now()
    )`);

    await queryRunner.query(`CREATE TABLE "auth"."user_role" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "auth"."user"("id") ON DELETE CASCADE,
      "role_id" uuid NOT NULL REFERENCES "auth"."role"("id") ON DELETE CASCADE,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "uq_user_role_user_id_role_id" UNIQUE ("user_id", "role_id")
    )`);

    await queryRunner.query(`CREATE TABLE "auth"."external_link" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "auth"."user"("id") ON DELETE CASCADE,
      "resource_type" varchar(100) NOT NULL,
      "resource_id" varchar(64) NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "uq_external_link_user_id_resource_type" UNIQUE ("user_id", "resource_type")
    )`);

    await queryRunner.query(`CREATE TABLE "auth"."oauth_client" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "client_id" varchar(100) NOT NULL UNIQUE,
      "client_secret_hash" varchar(255) NOT NULL DEFAULT '',
      "redirect_uris" text NOT NULL,
      "scope" varchar(500) NOT NULL DEFAULT '',
      "is_public" boolean NOT NULL DEFAULT true,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )`);

    await queryRunner.query(`CREATE TABLE "auth"."oauth_token" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "jti" varchar(100) NOT NULL UNIQUE,
      "user_id" uuid NOT NULL REFERENCES "auth"."user"("id") ON DELETE CASCADE,
      "client_id" varchar(100) NOT NULL,
      "kind" varchar(20) NOT NULL,
      "scope" varchar(500) NOT NULL DEFAULT '',
      "code_challenge" varchar(128) NOT NULL DEFAULT '',
      "expires_at" timestamptz NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "auth"."oauth_token"');
    await queryRunner.query('DROP TABLE IF EXISTS "auth"."oauth_client"');
    await queryRunner.query('DROP TABLE IF EXISTS "auth"."external_link"');
    await queryRunner.query('DROP TABLE IF EXISTS "auth"."user_role"');
    await queryRunner.query('DROP TABLE IF EXISTS "auth"."role"');
    await queryRunner.query('DROP TABLE IF EXISTS "auth"."user"');
    await queryRunner.query('DROP SCHEMA IF EXISTS "auth"');
  }
}
