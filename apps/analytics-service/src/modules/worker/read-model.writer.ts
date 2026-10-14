import { Inject, Injectable } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';

import { ANALYTICS_DATA_SOURCE } from '../../database/database.tokens';

/** Envelope fields every event leaves in the idempotency ledger. */
export interface EventMeta {
  readonly eventId: string;
  readonly eventType: string;
  readonly occurredAt: Date;
}

export interface BookedFact {
  readonly appointmentId: string;
  readonly patientRef: string;
  readonly practitionerRoleRef: string;
  readonly serviceId: string;
  readonly slotRef: string;
  readonly startAt: Date;
  readonly bookedAt: Date;
}

export interface CancelledFact {
  readonly appointmentId: string;
  readonly patientRef: string;
  readonly cancelledAt: Date;
  readonly actorType: string;
}

export interface EncounterFact {
  readonly encounterId: string;
  readonly patientRef: string;
  readonly practitionerRef: string;
  readonly specialtySystem: string | null;
  readonly specialtyCode: string;
  readonly specialtyDisplay: string | null;
  readonly completedAt: Date;
  readonly diagnosisCount: number;
}

/** `duplicate`: the `eventId` is already in the ledger, nothing was written. */
export type ApplyOutcome = 'applied' | 'duplicate';

/** Write side of the read-model: each call is one transaction, idempotent by `eventId`. */
export interface ReadModelWriter {
  isProcessed(eventId: string): Promise<boolean>;
  applyBooked(meta: EventMeta, fact: BookedFact): Promise<ApplyOutcome>;
  applyCancelled(meta: EventMeta, fact: CancelledFact): Promise<ApplyOutcome>;
  applyEncounterCompleted(meta: EventMeta, fact: EncounterFact): Promise<ApplyOutcome>;
}

export const READ_MODEL_WRITER = Symbol('READ_MODEL_WRITER');

const CLAIM_EVENT = `INSERT INTO "analytics"."processed_event" ("event_id", "event_type", "occurred_at")
  VALUES ($1, $2, $3) ON CONFLICT ("event_id") DO NOTHING RETURNING "event_id"`;

/** A booking never revives a cancellation that overtook it on the other queue. */
const UPSERT_BOOKED = `INSERT INTO "analytics"."appointment_fact"
  ("appointment_id", "status", "patient_ref", "practitioner_role_ref", "service_id", "slot_ref", "start_at", "booked_at")
  VALUES ($1, 'booked', $2, $3, $4, $5, $6, $7)
  ON CONFLICT ("appointment_id") DO UPDATE SET
    "patient_ref" = EXCLUDED."patient_ref",
    "practitioner_role_ref" = EXCLUDED."practitioner_role_ref",
    "service_id" = EXCLUDED."service_id",
    "slot_ref" = EXCLUDED."slot_ref",
    "start_at" = EXCLUDED."start_at",
    "booked_at" = EXCLUDED."booked_at",
    "updated_at" = now()`;

/** `patient_ref` is kept when the booking already set it. */
const UPSERT_CANCELLED = `INSERT INTO "analytics"."appointment_fact"
  ("appointment_id", "status", "patient_ref", "cancelled_at", "cancel_actor")
  VALUES ($1, 'cancelled', $2, $3, $4)
  ON CONFLICT ("appointment_id") DO UPDATE SET
    "status" = 'cancelled',
    "patient_ref" = COALESCE("appointment_fact"."patient_ref", EXCLUDED."patient_ref"),
    "cancelled_at" = EXCLUDED."cancelled_at",
    "cancel_actor" = EXCLUDED."cancel_actor",
    "updated_at" = now()`;

/** An encounter is completed once (BR-003): a second fact for the same id is ignored. */
const INSERT_ENCOUNTER = `INSERT INTO "analytics"."encounter_fact"
  ("encounter_id", "patient_ref", "practitioner_ref", "specialty_system", "specialty_code", "specialty_display", "completed_at", "diagnosis_count")
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  ON CONFLICT ("encounter_id") DO NOTHING`;

/**
 * TypeORM implementation. The ledger row and the fact are written in the same
 * transaction: a concurrent redelivery blocks on the ledger's primary key until
 * the first copy commits (then sees the conflict) or rolls back (then wins).
 */
@Injectable()
export class TypeOrmReadModelWriter implements ReadModelWriter {
  constructor(@Inject(ANALYTICS_DATA_SOURCE) private readonly dataSource: DataSource) {}

  async isProcessed(eventId: string): Promise<boolean> {
    const rows: unknown = await this.dataSource.query(
      'SELECT 1 FROM "analytics"."processed_event" WHERE "event_id" = $1',
      [eventId],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  applyBooked(meta: EventMeta, fact: BookedFact): Promise<ApplyOutcome> {
    return this.applyOnce(meta, UPSERT_BOOKED, [
      fact.appointmentId,
      fact.patientRef,
      fact.practitionerRoleRef,
      fact.serviceId,
      fact.slotRef,
      fact.startAt,
      fact.bookedAt,
    ]);
  }

  applyCancelled(meta: EventMeta, fact: CancelledFact): Promise<ApplyOutcome> {
    return this.applyOnce(meta, UPSERT_CANCELLED, [fact.appointmentId, fact.patientRef, fact.cancelledAt, fact.actorType]);
  }

  applyEncounterCompleted(meta: EventMeta, fact: EncounterFact): Promise<ApplyOutcome> {
    return this.applyOnce(meta, INSERT_ENCOUNTER, [
      fact.encounterId,
      fact.patientRef,
      fact.practitionerRef,
      fact.specialtySystem,
      fact.specialtyCode,
      fact.specialtyDisplay,
      fact.completedAt,
      fact.diagnosisCount,
    ]);
  }

  private applyOnce(meta: EventMeta, statement: string, parameters: ReadonlyArray<unknown>): Promise<ApplyOutcome> {
    return this.dataSource.transaction(async (manager: EntityManager): Promise<ApplyOutcome> => {
      const claimed: unknown = await manager.query(CLAIM_EVENT, [meta.eventId, meta.eventType, meta.occurredAt]);
      if (!Array.isArray(claimed) || claimed.length === 0) {
        return 'duplicate';
      }
      await manager.query(statement, [...parameters]);
      return 'applied';
    });
  }
}
