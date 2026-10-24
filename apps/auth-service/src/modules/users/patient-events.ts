import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { PatientRegisteredEvent } from '@medcenter/contracts';
import { buildOutboxBasic, FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';

/**
 * The `patient.registered.v1` envelope. It is not published here: the account factory records it as an
 * outbox entry in HAPI and `outbox-relay` publishes it (ADR-021). A fresh `eventId` is the consumers' dedup key.
 *
 * Payload minimisation (ADR-021): the account email is not in the event. No consumer reads it, and the
 * outbox lives in the clinical store, which must not hold contact data beyond the Patient itself.
 */
export function registeredEvent(patientId: string): PatientRegisteredEvent {
  return { v: 1, type: 'patient.registered.v1', eventId: randomUUID(), occurredAt: new Date().toISOString(), patientId };
}

/**
 * Writes and, when an account is compensated, removes the outbox `Basic` of a registration (ADR-021).
 * PostgreSQL and HAPI cannot share a transaction, so the record is one HAPI write made as the last step
 * that can fail: the account exists if and only if its outbox record does.
 *
 * The record is stored under a client-assigned id (the `eventId`, as ADR-020 does for other ids), so even when
 * the write ends without an answer the compensation knows what to delete.
 */
@Injectable()
export class RegistrationOutbox {
  constructor(@Inject(FHIR_CLIENT) private readonly fhir: FhirClient) {}

  async record(event: PatientRegisteredEvent): Promise<void> {
    await this.fhir.update('Basic', event.eventId, { ...buildOutboxBasic(event), id: event.eventId });
  }

  /** Idempotent: a record that was never stored (404) or is already gone (410) is not an error for the caller to handle. */
  async remove(event: PatientRegisteredEvent): Promise<void> {
    await this.fhir.delete('Basic', event.eventId);
  }
}
