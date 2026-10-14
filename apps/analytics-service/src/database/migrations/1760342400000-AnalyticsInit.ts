import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial `analytics` read-model (architect §5, ADR-011/014). Nothing here is
 * clinical truth: every row is derived from domain events or copied from HAPI,
 * so the whole schema can be dropped and rebuilt by replaying the sources.
 *
 * - `processed_event` — idempotency ledger of the worker, keyed by `eventId`.
 * - `appointment_fact` / `encounter_fact` — one row per subject (API §9.1–9.3).
 * - `audit_event` — journal copy of FHIR `AuditEvent` (API §9.4).
 * - `sync_cursor` — high-water mark of the HAPI pull.
 */
export class AnalyticsInit1760342400000 implements MigrationInterface {
  public readonly name = 'AnalyticsInit1760342400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE SCHEMA IF NOT EXISTS "analytics"');
    await this.createLedger(queryRunner);
    await this.createAppointmentFacts(queryRunner);
    await this.createEncounterFacts(queryRunner);
    await this.createAuditJournal(queryRunner);
    await this.createSyncCursor(queryRunner);
  }

  /** The schema stays: TypeORM keeps its `migrations` table in it. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "analytics"."sync_cursor"');
    await queryRunner.query('DROP TABLE IF EXISTS "analytics"."audit_event"');
    await queryRunner.query('DROP TABLE IF EXISTS "analytics"."encounter_fact"');
    await queryRunner.query('DROP TABLE IF EXISTS "analytics"."appointment_fact"');
    await queryRunner.query('DROP TABLE IF EXISTS "analytics"."processed_event"');
  }

  /** Idempotency ledger of the worker: a redelivered `eventId` conflicts on the primary key. */
  private async createLedger(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "analytics"."processed_event" (
      "event_id" varchar(128) PRIMARY KEY,
      "event_type" varchar(64) NOT NULL,
      "occurred_at" timestamptz NOT NULL,
      "processed_at" timestamptz NOT NULL DEFAULT now()
    )`);
  }

  private async createAppointmentFacts(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "analytics"."appointment_fact" (
      "appointment_id" varchar(64) PRIMARY KEY,
      "status" varchar(16) NOT NULL CHECK ("status" IN ('booked', 'cancelled')),
      "patient_ref" varchar(128),
      "practitioner_role_ref" varchar(128),
      "service_id" varchar(64),
      "slot_ref" varchar(128),
      "start_at" timestamptz,
      "booked_at" timestamptz,
      "cancelled_at" timestamptz,
      "cancel_actor" varchar(16),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(
      'CREATE INDEX "ix_appointment_fact_start_at" ON "analytics"."appointment_fact" ("start_at")',
    );
  }

  private async createEncounterFacts(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "analytics"."encounter_fact" (
      "encounter_id" varchar(64) PRIMARY KEY,
      "patient_ref" varchar(128) NOT NULL,
      "practitioner_ref" varchar(128) NOT NULL,
      "specialty_system" varchar(255),
      "specialty_code" varchar(128) NOT NULL DEFAULT 'unknown',
      "specialty_display" varchar(255),
      "completed_at" timestamptz NOT NULL,
      "diagnosis_count" integer NOT NULL DEFAULT 0
    )`);
    await queryRunner.query(
      'CREATE INDEX "ix_encounter_fact_completed_at" ON "analytics"."encounter_fact" ("completed_at")',
    );
  }

  /** Newest-first paging, user filter and resource filter of API §9.4 each have an index. */
  private async createAuditJournal(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "analytics"."audit_event" (
      "id" varchar(64) PRIMARY KEY,
      "occurred_at" timestamptz NOT NULL,
      "user_id" varchar(128),
      "action" varchar(16) NOT NULL CHECK ("action" IN ('create', 'update', 'delete')),
      "resource_type" varchar(64),
      "resource_id" varchar(64),
      "request_id" varchar(128),
      "source" varchar(128)
    )`);
    await queryRunner.query(
      'CREATE INDEX "ix_audit_event_occurred_at" ON "analytics"."audit_event" ("occurred_at" DESC, "id" DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX "ix_audit_event_user_id" ON "analytics"."audit_event" ("user_id", "occurred_at" DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX "ix_audit_event_resource" ON "analytics"."audit_event" ("resource_type", "resource_id", "occurred_at" DESC)',
    );
  }

  private async createSyncCursor(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "analytics"."sync_cursor" (
      "name" varchar(64) PRIMARY KEY,
      "cursor_value" timestamptz NOT NULL,
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )`);
  }
}
