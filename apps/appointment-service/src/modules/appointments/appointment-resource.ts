import { InternalServerErrorException } from '@nestjs/common';
import type { FhirResource } from '@medcenter/fhir';

import { parseReference } from './fhir-reference';

export const BOOKED = 'booked';

export interface BookableSlot {
  readonly slotId: string;
  readonly slot: FhirResource;
  readonly practitionerRoleId: string;
  readonly practitionerId: string;
  readonly serviceId: string;
}

export function rolePractitionerId(role: FhirResource): string {
  const reference = (role['practitioner'] as { reference?: unknown } | undefined)?.reference;
  const parsed = parseReference(reference);
  return parsed?.type === 'Practitioner' ? parsed.id : '';
}

export function stringOf(resource: FhirResource, key: string): string {
  const value = resource[key];
  return typeof value === 'string' ? value : '';
}

export function scheduleActorId(schedule: FhirResource, resourceType: string): string {
  const actors = (schedule['actor'] as Array<{ reference?: unknown }> | undefined) ?? [];
  const actor = actors
    .map((candidate) => parseReference(candidate.reference))
    .find((reference) => reference?.type === resourceType);
  return actor?.id ?? '';
}

/** An empty id would turn into a `GET Slot/` collection request, so a missing reference fails here. */
export function missingReference(detail: string): InternalServerErrorException {
  return new InternalServerErrorException({ errorCode: 'INTERNAL', message: `INTERNAL: ${detail}` });
}

export function buildBookedAppointment(bookable: BookableSlot, patientRef: string, reason: string | undefined): FhirResource {
  const { slotId, slot, practitionerRoleId, practitionerId, serviceId } = bookable;
  return {
    resourceType: 'Appointment',
    status: BOOKED,
    start: stringOf(slot, 'start'),
    end: stringOf(slot, 'end'),
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
