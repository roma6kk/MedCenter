import { ForbiddenException } from '@nestjs/common';
import { FHIR_ID_PATTERN, type JwtClaims, requirePatientRef } from '@medcenter/common';

const REFERENCE_PATTERN =
  /(?:^|\/)([A-Z][A-Za-z]+)\/((?!\.+(?:\/|$))[A-Za-z0-9\-.]{1,64})(?:\/_history\/[A-Za-z0-9\-.]{1,64})?$/;

interface ParsedReference {
  readonly type: string;
  readonly id: string;
}

export function parseReference(reference: unknown): ParsedReference | undefined {
  if (typeof reference !== 'string') {
    return undefined;
  }
  const match = REFERENCE_PATTERN.exec(reference);
  const type = match?.[1];
  const id = match?.[2];
  return type === undefined || id === undefined ? undefined : { type, id };
}

export function referenceId(reference: unknown): string {
  return parseReference(reference)?.id ?? '';
}

export function canonicalReference(reference: unknown, type: string): string | undefined {
  const parsed = parseReference(reference);
  return parsed?.type === type ? `${parsed.type}/${parsed.id}` : undefined;
}

function invalidPatientContext(): ForbiddenException {
  return new ForbiddenException({ errorCode: 'COMPARTMENT_VIOLATION', message: 'Token carries an invalid patient context' });
}

/** The SMART `patient` claim is a bare id; a Patient reference is accepted too, anything else fails closed. */
export function toPatientReference(patientClaim: string): string {
  if (FHIR_ID_PATTERN.test(patientClaim)) {
    return `Patient/${patientClaim}`;
  }
  const reference = canonicalReference(patientClaim, 'Patient');
  if (reference === undefined) {
    throw invalidPatientContext();
  }
  return reference;
}

export function requirePatientReference(claims: JwtClaims): string {
  return toPatientReference(requirePatientRef(claims));
}
