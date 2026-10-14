import { ForbiddenException } from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';
import { Role } from '@medcenter/contracts';
import type { FhirResource } from '@medcenter/fhir';

import { practitionerRoleRefFromClaims } from '../../common/access/claims-identity';
import { arrayField, referenceField } from '../../common/fhir/fhir-read';
import { canonicalReference } from '../../common/fhir/fhir-reference';

/** Who reads an encounter (API §7.2): its participant doctor or an admin. */
export type EncounterViewer = { readonly kind: 'doctor'; readonly roleRef: string } | { readonly kind: 'admin' };

/** Parties of an Appointment as written by appointment-service (`participant[].actor`). */
export interface AppointmentParties {
  readonly patientRef?: string;
  readonly practitionerRoleRefs: readonly string[];
  readonly serviceRef?: string;
}

function compartmentViolation(message: string): ForbiddenException {
  return new ForbiddenException({ errorCode: 'COMPARTMENT_VIOLATION', message: `COMPARTMENT_VIOLATION: ${message}` });
}

/** `resource[listKey][].<referenceKey>.reference` of the given type, canonicalised to `Type/id`. */
function referencesOf(resource: FhirResource, listKey: string, referenceKey: string, type: string): string[] {
  return arrayField(resource, listKey)
    .map((item) => canonicalReference(referenceField(item, referenceKey), type))
    .filter((reference): reference is string => reference !== undefined);
}

/** `PractitionerRole/{id}` participants of an Encounter (`participant[].individual`). */
export function encounterPractitionerRoleRefs(encounter: FhirResource): string[] {
  return referencesOf(encounter, 'participant', 'individual', 'PractitionerRole');
}

export function appointmentParties(appointment: FhirResource): AppointmentParties {
  return {
    patientRef: referencesOf(appointment, 'participant', 'actor', 'Patient')[0],
    practitionerRoleRefs: referencesOf(appointment, 'participant', 'actor', 'PractitionerRole'),
    serviceRef: referencesOf(appointment, 'participant', 'actor', 'HealthcareService')[0],
  };
}

/** Resolves the caller before any FHIR call, so an incomplete doctor token fails closed. */
export function resolveEncounterViewer(claims: JwtClaims): EncounterViewer {
  if (claims.role === Role.ADMIN) {
    return { kind: 'admin' };
  }
  if (claims.role === Role.DOCTOR) {
    return { kind: 'doctor', roleRef: practitionerRoleRefFromClaims(claims) };
  }
  throw new ForbiddenException({ errorCode: 'FORBIDDEN_ROLE', message: `Role ${claims.role} cannot read encounters` });
}

/** The doctor must be a participant of the encounter (checked before its state is revealed). */
export function assertEncounterParticipant(roleRef: string, encounter: FhirResource): void {
  if (!encounterPractitionerRoleRefs(encounter).includes(roleRef)) {
    throw compartmentViolation('encounter is not assigned to this practitioner');
  }
}

export function assertViewerSeesEncounter(viewer: EncounterViewer, encounter: FhirResource): void {
  if (viewer.kind === 'doctor') {
    assertEncounterParticipant(viewer.roleRef, encounter);
  }
}

/** The doctor must be the appointment's practitioner (API §7.1). */
export function assertAppointmentParticipant(roleRef: string, parties: AppointmentParties): void {
  if (!parties.practitionerRoleRefs.includes(roleRef)) {
    throw compartmentViolation('appointment is not assigned to this practitioner');
  }
}
