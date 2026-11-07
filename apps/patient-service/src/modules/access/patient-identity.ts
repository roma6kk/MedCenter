import { ForbiddenException } from '@nestjs/common';
import { FHIR_ID_PATTERN, type JwtClaims, requirePatientRef } from '@medcenter/common';

const PATIENT_PREFIX = 'Patient/';
const PRACTITIONER_ROLE_PREFIX = 'PractitionerRole/';

export function isFhirId(value: string): boolean {
  return FHIR_ID_PATTERN.test(value);
}

export function compartmentViolation(reason: string): ForbiddenException {
  return new ForbiddenException({ errorCode: 'COMPARTMENT_VIOLATION', message: `COMPARTMENT_VIOLATION: ${reason}` });
}

// Fails closed: a malformed `patient` claim must never be spliced into a FHIR search.
export function ownPatientId(claims: JwtClaims): string {
  const claim = requirePatientRef(claims);
  const id = claim.startsWith(PATIENT_PREFIX) ? claim.slice(PATIENT_PREFIX.length) : claim;
  if (!isFhirId(id)) {
    throw compartmentViolation('token patient claim is not a Patient id');
  }
  return id;
}

// Fails closed: without a practitioner identity no compartment can be proven.
export function practitionerRoleIdOf(claims: JwtClaims): string {
  const fhirUser = claims.fhirUser;
  if (fhirUser === undefined || !fhirUser.startsWith(PRACTITIONER_ROLE_PREFIX)) {
    throw compartmentViolation('token carries no PractitionerRole identity');
  }
  const id = fhirUser.slice(PRACTITIONER_ROLE_PREFIX.length);
  if (!isFhirId(id)) {
    throw compartmentViolation('token fhirUser is not a PractitionerRole id');
  }
  return id;
}

export function referencesResource(reference: unknown, type: string, id: string): boolean {
  if (typeof reference !== 'string') {
    return false;
  }
  const target = `${type}/${id}`;
  return reference === target || reference.endsWith(`/${target}`);
}
