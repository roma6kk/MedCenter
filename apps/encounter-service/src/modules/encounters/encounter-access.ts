import { ForbiddenException } from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';
import { Role } from '@medcenter/contracts';
import type { FhirResource } from '@medcenter/fhir';

import { practitionerRoleRefFromClaims } from '../../common/access/claims-identity';
import { arrayField, referenceField } from '../../common/fhir/fhir-read';
import { canonicalReference } from '../../common/fhir/fhir-reference';

export interface EncounterViewer {
  readonly kind: 'doctor';
  readonly roleRef: string;
}

export interface AppointmentParties {
  readonly patientRef?: string;
  readonly practitionerRoleRefs: readonly string[];
  readonly serviceRef?: string;
}

function compartmentViolation(message: string): ForbiddenException {
  return new ForbiddenException({ errorCode: 'COMPARTMENT_VIOLATION', message: `COMPARTMENT_VIOLATION: ${message}` });
}

function referencesOf(resource: FhirResource, listKey: string, referenceKey: string, type: string): string[] {
  return arrayField(resource, listKey)
    .map((item) => canonicalReference(referenceField(item, referenceKey), type))
    .filter((reference): reference is string => reference !== undefined);
}

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

// Resolves the caller before any FHIR call, so an incomplete doctor token fails closed.
export function resolveEncounterViewer(claims: JwtClaims): EncounterViewer {
  if (claims.role === Role.DOCTOR) {
    return { kind: 'doctor', roleRef: practitionerRoleRefFromClaims(claims) };
  }
  throw new ForbiddenException({ errorCode: 'FORBIDDEN_ROLE', message: `Role ${claims.role} cannot read encounters` });
}

// Checked before the encounter state is revealed.
export function assertEncounterParticipant(roleRef: string, encounter: FhirResource): void {
  if (!encounterPractitionerRoleRefs(encounter).includes(roleRef)) {
    throw compartmentViolation('encounter is not assigned to this practitioner');
  }
}

export function assertViewerSeesEncounter(viewer: EncounterViewer, encounter: FhirResource): void {
  assertEncounterParticipant(viewer.roleRef, encounter);
}

export function assertAppointmentParticipant(roleRef: string, parties: AppointmentParties): void {
  if (!parties.practitionerRoleRefs.includes(roleRef)) {
    throw compartmentViolation('appointment is not assigned to this practitioner');
  }
}
