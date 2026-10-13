import { ForbiddenException } from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';
import type { FhirResource } from '@medcenter/fhir';

import { referenceId } from './fhir-transaction';

/** Patient participant of an Appointment, e.g. `Patient/9f2c`, or `undefined` if none. */
export function patientRefOf(appointment: FhirResource): string | undefined {
  const participants = (appointment['participant'] as Array<{ actor?: { reference?: unknown } }> | undefined) ?? [];
  const reference = participants
    .map((p) => p.actor?.reference)
    .find((ref): ref is string => typeof ref === 'string' && ref.startsWith('Patient/'));
  return reference;
}

/** Throws `COMPARTMENT_VIOLATION` unless the caller is the appointment's patient. */
export function assertPatientOwns(claims: JwtClaims, appointment: FhirResource): void {
  const owner = patientRefOf(appointment);
  if (owner === undefined || claims.patient !== owner) {
    throw new ForbiddenException({ errorCode: 'COMPARTMENT_VIOLATION', message: 'Appointment belongs to another patient' });
  }
}

/** PractitionerRole participant of an Appointment, e.g. `PractitionerRole/role-1`, or `undefined`. */
export function practitionerRoleRefOf(appointment: FhirResource): string | undefined {
  const participants = (appointment['participant'] as Array<{ actor?: { reference?: unknown } }> | undefined) ?? [];
  return participants
    .map((p) => p.actor?.reference)
    .find((ref): ref is string => typeof ref === 'string' && ref.startsWith('PractitionerRole/'));
}

/**
 * Doctor ownership (API §6.6): the token's `fhirUser` must be the PractitionerRole
 * that participates in the appointment. Fails closed: a token without a
 * practitioner identity is refused, so a missing claim never grants access.
 */
export function assertDoctorParticipates(claims: JwtClaims, appointment: FhirResource): void {
  const caller = claims.fhirUser;
  const participant = practitionerRoleRefOf(appointment);
  if (caller === undefined || !caller.startsWith('PractitionerRole/') || caller !== participant) {
    throw new ForbiddenException({ errorCode: 'COMPARTMENT_VIOLATION', message: 'Appointment is not assigned to this practitioner' });
  }
}

/** Slot id an Appointment occupies (`Appointment.slot[0]`). */
export function slotIdOf(appointment: FhirResource): string {
  const slots = (appointment['slot'] as Array<{ reference?: unknown }> | undefined) ?? [];
  return referenceId(slots[0]?.reference);
}
