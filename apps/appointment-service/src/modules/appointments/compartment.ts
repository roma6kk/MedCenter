import { ForbiddenException } from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';
import { Role } from '@medcenter/contracts';
import type { FhirResource } from '@medcenter/fhir';

import { canonicalReference, requirePatientReference } from './fhir-reference';
import { referenceId } from './fhir-transaction';

/**
 * Who reads an appointment, resolved from the token alone (ADR-013): a patient
 * by `patient`, a doctor by `fhirUser` (`PractitionerRole/{id}`), an admin
 * without a compartment.
 */
export type AppointmentViewer =
  | { readonly kind: 'patient'; readonly reference: string }
  | { readonly kind: 'doctor'; readonly reference: string }
  | { readonly kind: 'admin' };

function compartmentViolation(message: string): ForbiddenException {
  return new ForbiddenException({ errorCode: 'COMPARTMENT_VIOLATION', message });
}

/** First participant of the given type, in canonical `Type/id` form, or `undefined`. */
function participantRefOf(appointment: FhirResource, type: string): string | undefined {
  const participants = (appointment['participant'] as Array<{ actor?: { reference?: unknown } }> | undefined) ?? [];
  return participants
    .map((participant) => canonicalReference(participant.actor?.reference, type))
    .find((reference): reference is string => reference !== undefined);
}

/** Patient participant of an Appointment, e.g. `Patient/9f2c`, or `undefined` if none. */
export function patientRefOf(appointment: FhirResource): string | undefined {
  return participantRefOf(appointment, 'Patient');
}

/** PractitionerRole participant of an Appointment, e.g. `PractitionerRole/role-1`, or `undefined`. */
export function practitionerRoleRefOf(appointment: FhirResource): string | undefined {
  return participantRefOf(appointment, 'PractitionerRole');
}

/**
 * Throws `COMPARTMENT_VIOLATION` unless `callerRef` (the token's
 * `Patient/{id}`, see `requirePatientReference`) is the appointment's patient.
 */
export function assertPatientOwns(callerRef: string, appointment: FhirResource): void {
  const owner = patientRefOf(appointment);
  if (owner === undefined || callerRef !== owner) {
    throw compartmentViolation('Appointment belongs to another patient');
  }
}

/**
 * Doctor identity (API §6.5/6.6): `fhirUser` must name a PractitionerRole.
 * Fails closed — a token without that identity never reaches FHIR.
 */
export function requireDoctorRoleRef(claims: JwtClaims): string {
  const reference = canonicalReference(claims.fhirUser, 'PractitionerRole');
  if (reference === undefined) {
    throw compartmentViolation('Token carries no PractitionerRole identity (fhirUser)');
  }
  return reference;
}

/**
 * Doctor ownership (API §6.6): `callerRef` (the token's `fhirUser`, see
 * `requireDoctorRoleRef`, which fails closed) must be the PractitionerRole
 * that participates in the appointment.
 */
export function assertDoctorParticipates(callerRef: string, appointment: FhirResource): void {
  if (callerRef !== practitionerRoleRefOf(appointment)) {
    throw compartmentViolation('Appointment is not assigned to this practitioner');
  }
}

/** Resolves the caller's compartment before any FHIR call, so an incomplete token fails closed. */
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

/** API §6.3: owner patient, participant doctor or admin; anyone else gets `COMPARTMENT_VIOLATION`. */
export function assertViewerCanSee(viewer: AppointmentViewer, appointment: FhirResource): void {
  if (viewer.kind === 'patient') {
    assertPatientOwns(viewer.reference, appointment);
  } else if (viewer.kind === 'doctor') {
    assertDoctorParticipates(viewer.reference, appointment);
  }
}

/** Slot id an Appointment occupies (`Appointment.slot[0]`). */
export function slotIdOf(appointment: FhirResource): string {
  const slots = (appointment['slot'] as Array<{ reference?: unknown }> | undefined) ?? [];
  return referenceId(slots[0]?.reference);
}
