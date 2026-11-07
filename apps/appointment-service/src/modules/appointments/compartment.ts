import { ForbiddenException } from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';
import { Role } from '@medcenter/contracts';
import type { FhirResource } from '@medcenter/fhir';

import { canonicalReference, requirePatientReference } from './fhir-reference';
import { referenceId } from './fhir-transaction';

export type AppointmentViewer =
  | { readonly kind: 'patient'; readonly reference: string }
  | { readonly kind: 'doctor'; readonly reference: string }
  | { readonly kind: 'admin' };

function compartmentViolation(message: string): ForbiddenException {
  return new ForbiddenException({ errorCode: 'COMPARTMENT_VIOLATION', message });
}

function participantRefOf(appointment: FhirResource, type: string): string | undefined {
  const participants = (appointment['participant'] as Array<{ actor?: { reference?: unknown } }> | undefined) ?? [];
  return participants
    .map((participant) => canonicalReference(participant.actor?.reference, type))
    .find((reference): reference is string => reference !== undefined);
}

export function patientRefOf(appointment: FhirResource): string | undefined {
  return participantRefOf(appointment, 'Patient');
}

export function practitionerRoleRefOf(appointment: FhirResource): string | undefined {
  return participantRefOf(appointment, 'PractitionerRole');
}

export function assertPatientOwns(callerRef: string, appointment: FhirResource): void {
  const owner = patientRefOf(appointment);
  if (owner === undefined || callerRef !== owner) {
    throw compartmentViolation('Appointment belongs to another patient');
  }
}

/** Fails closed: a token without a PractitionerRole `fhirUser` never reaches FHIR. */
export function requireDoctorRoleRef(claims: JwtClaims): string {
  const reference = canonicalReference(claims.fhirUser, 'PractitionerRole');
  if (reference === undefined) {
    throw compartmentViolation('Token carries no PractitionerRole identity (fhirUser)');
  }
  return reference;
}

export function assertDoctorParticipates(callerRef: string, appointment: FhirResource): void {
  if (callerRef !== practitionerRoleRefOf(appointment)) {
    throw compartmentViolation('Appointment is not assigned to this practitioner');
  }
}

export function resolveViewer(claims: JwtClaims): AppointmentViewer {
  switch (claims.role) {
    case Role.PATIENT:
      return { kind: 'patient', reference: requirePatientReference(claims) };
    case Role.DOCTOR:
      return { kind: 'doctor', reference: requireDoctorRoleRef(claims) };
    case Role.ADMIN:
      return { kind: 'admin' };
    default:
      throw new ForbiddenException({ errorCode: 'FORBIDDEN_ROLE', message: `Role ${claims.role} cannot read appointments` });
  }
}

export function assertViewerCanSee(viewer: AppointmentViewer, appointment: FhirResource): void {
  if (viewer.kind === 'patient') {
    assertPatientOwns(viewer.reference, appointment);
  } else if (viewer.kind === 'doctor') {
    assertDoctorParticipates(viewer.reference, appointment);
  }
}

export function slotIdOf(appointment: FhirResource): string {
  const slots = (appointment['slot'] as Array<{ reference?: unknown }> | undefined) ?? [];
  return referenceId(slots[0]?.reference);
}
