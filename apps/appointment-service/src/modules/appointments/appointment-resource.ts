import { InternalServerErrorException } from '@nestjs/common';
import type { FhirResource } from '@medcenter/fhir';

import { parseReference } from './fhir-reference';
import { idFromLocation } from './fhir-transaction';

export const BOOKED = 'booked';

/** A free Slot with the PractitionerRole and HealthcareService of its Schedule (bare ids). */
export interface BookableSlot {
  readonly slotId: string;
  readonly slot: FhirResource;
  readonly practitionerRoleId: string;
  readonly serviceId: string;
}

export function stringOf(resource: FhirResource, key: string): string {
  const value = resource[key];
  return typeof value === 'string' ? value : '';
}

/** `Schedule.actor` entry of the given resource type, as a bare id; relative and absolute references alike. */
export function scheduleActorId(schedule: FhirResource, resourceType: string): string {
  const actors = (schedule['actor'] as Array<{ reference?: unknown }> | undefined) ?? [];
  const actor = actors
    .map((candidate) => parseReference(candidate.reference))
    .find((reference) => reference?.type === resourceType);
  return actor?.id ?? '';
}

/**
 * A stored resource lacks a reference the write path needs. An empty id would
 * otherwise turn into a `GET Slot/` (or `Schedule/`) collection request, so it
 * fails here as an internal data error instead.
 */
export function missingReference(detail: string): InternalServerErrorException {
  return new InternalServerErrorException({ errorCode: 'INTERNAL', message: `INTERNAL: ${detail}` });
}

/** The `Appointment(status=booked)` a booking creates: Patient, PractitionerRole and service participants. */
export function buildBookedAppointment(bookable: BookableSlot, patientRef: string, reason: string | undefined): FhirResource {
  const { slotId, slot, practitionerRoleId, serviceId } = bookable;
  return {
    resourceType: 'Appointment',
    status: BOOKED,
    start: stringOf(slot, 'start'),
    end: stringOf(slot, 'end'),
    created: new Date().toISOString().slice(0, 10),
    slot: [{ reference: `Slot/${slotId}` }],
    participant: [
      { actor: { reference: patientRef }, status: 'accepted' },
      { actor: { reference: `PractitionerRole/${practitionerRoleId}` }, status: 'accepted' },
      { actor: { reference: `HealthcareService/${serviceId}` }, status: 'accepted' },
    ],
    ...(reason === undefined ? {} : { reasonCode: [{ text: reason }] }),
  };
}

/** Id HAPI assigned to the Appointment, the second entry of the booking transaction. */
export function createdAppointmentId(transactionResponse: FhirResource): string {
  const entries = (transactionResponse['entry'] as Array<{ response?: { location?: string } }> | undefined) ?? [];
  const appointmentId = idFromLocation(entries[1]?.response?.location);
  if (appointmentId === '') {
    throw new InternalServerErrorException({ errorCode: 'INTERNAL', message: 'Transaction response has no Appointment id' });
  }
  return appointmentId;
}
