import { InternalServerErrorException } from '@nestjs/common';
import type { FhirResource } from '@medcenter/fhir';

import { parseReference } from './fhir-reference';

export const BOOKED = 'booked';

/** A free Slot with the PractitionerRole and HealthcareService of its Schedule (bare ids). */
export interface BookableSlot {
  readonly slotId: string;
  readonly slot: FhirResource;
  readonly practitionerRoleId: string;
  /** `Practitioner.id` behind the role; `''` when the role does not name one. */
  readonly practitionerId: string;
  readonly serviceId: string;
}

/** The `Practitioner` a PractitionerRole stands for, as a bare id (`''` when the role has none). */
export function rolePractitionerId(role: FhirResource): string {
  const reference = (role['practitioner'] as { reference?: unknown } | undefined)?.reference;
  const parsed = parseReference(reference);
  return parsed?.type === 'Practitioner' ? parsed.id : '';
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

/**
 * The `Appointment(status=booked)` a booking creates: Patient, PractitionerRole,
 * the Practitioner behind the role and the service as participants. The Practitioner
 * is stored so that every answer built from the Appointment alone (booking, cancel,
 * no-show) carries the `doctorId` API §6 promises, without a second FHIR read.
 */
export function buildBookedAppointment(bookable: BookableSlot, patientRef: string, reason: string | undefined): FhirResource {
  const { slotId, slot, practitionerRoleId, practitionerId, serviceId } = bookable;
  return {
    resourceType: 'Appointment',
    status: BOOKED,
    start: stringOf(slot, 'start'),
    end: stringOf(slot, 'end'),
    // FHIR `dateTime`: the instant, as API §6 `createdAt` (RFC 3339) promises.
    created: new Date().toISOString(),
    slot: [{ reference: `Slot/${slotId}` }],
    participant: [
      { actor: { reference: patientRef }, status: 'accepted' },
      { actor: { reference: `PractitionerRole/${practitionerRoleId}` }, status: 'accepted' },
      ...(practitionerId === '' ? [] : [{ actor: { reference: `Practitioner/${practitionerId}` }, status: 'accepted' }]),
      { actor: { reference: `HealthcareService/${serviceId}` }, status: 'accepted' },
    ],
    ...(reason === undefined ? {} : { reasonCode: [{ text: reason }] }),
  };
}
