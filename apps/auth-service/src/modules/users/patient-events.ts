import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { PatientRegisteredEvent } from '@medcenter/contracts';
import { buildOutboxBasic, FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';

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

  async remove(event: PatientRegisteredEvent): Promise<void> {
    await this.fhir.delete('Basic', event.eventId);
  }
}
