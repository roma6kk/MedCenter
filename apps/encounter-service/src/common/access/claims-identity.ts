import { ForbiddenException } from '@nestjs/common';
import { FHIR_ID_PATTERN, type JwtClaims, requirePatientRef } from '@medcenter/common';

const PATIENT_PREFIX = 'Patient/';
const PRACTITIONER_ROLE_PREFIX = 'PractitionerRole/';

export function isFhirId(value: string): boolean {
  return FHIR_ID_PATTERN.test(value);
}

function compartmentViolation(message: string): ForbiddenException {
  return new ForbiddenException({ errorCode: 'COMPARTMENT_VIOLATION', message: `COMPARTMENT_VIOLATION: ${message}` });
}

/**
 * Patient compartment reference (`Patient/{id}`) taken from the token only
 * (ADR-013). The SMART `patient` claim is a bare id; a `Patient/{id}` value is
 * accepted too, so both issuer formats resolve to the same compartment.
 */
export function patientRefFromClaims(claims: JwtClaims): string {
  const raw = requirePatientRef(claims);
  const id = raw.startsWith(PATIENT_PREFIX) ? raw.slice(PATIENT_PREFIX.length) : raw;
  if (!isFhirId(id)) {
    throw compartmentViolation('token patient context is not a FHIR id');
  }
  return `${PATIENT_PREFIX}${id}`;
}

/**
 * Doctor identity (`PractitionerRole/{id}`) from the `fhirUser` claim. Fails
 * closed: a token without a practitioner identity never grants access.
 */
export function practitionerRoleRefFromClaims(claims: JwtClaims): string {
  const reference = claims.fhirUser;
  if (reference === undefined || !reference.startsWith(PRACTITIONER_ROLE_PREFIX)) {
    throw compartmentViolation('token carries no PractitionerRole identity');
  }
  if (!isFhirId(reference.slice(PRACTITIONER_ROLE_PREFIX.length))) {
    throw compartmentViolation('token PractitionerRole identity is not a FHIR id');
  }
  return reference;
}
