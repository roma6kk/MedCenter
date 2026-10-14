import { ForbiddenException } from '@nestjs/common';
import { requirePatientRef, type JwtClaims } from '@medcenter/common';

/**
 * FHIR R4 `id` datatype: `[A-Za-z0-9\-\.]{1,64}` (HAPI assigns numeric ids,
 * catalog-service a SHA-256 hex digest). Dot-only values (`.`, `..`) are refused
 * on top of the R4 regex: as a URL path segment they collapse `Slot/{id}` into
 * `Slot/` (a search) or the server base, so they can never name a resource.
 */
export const FHIR_ID_PATTERN = /^(?!\.+$)[A-Za-z0-9\-.]{1,64}$/;

/**
 * `Type/id` at the end of a reference, optionally followed by `/_history/n`.
 * Anything before it (an absolute base URL) is ignored. The id follows the same
 * rule as {@link FHIR_ID_PATTERN}, so a reference never yields a dot-only id.
 */
const REFERENCE_PATTERN =
  /(?:^|\/)([A-Z][A-Za-z]+)\/((?!\.+(?:\/|$))[A-Za-z0-9\-.]{1,64})(?:\/_history\/[A-Za-z0-9\-.]{1,64})?$/;

export interface ParsedReference {
  readonly type: string;
  readonly id: string;
}

/**
 * Parses a FHIR reference into its resource type and logical id. Relative
 * (`Patient/x`), absolute (`http://hapi/fhir/Patient/x`) and versioned
 * (`Patient/x/_history/2`) forms all resolve to the same `{ type, id }`, so a
 * compartment check never fails on formatting alone.
 */
export function parseReference(reference: unknown): ParsedReference | undefined {
  if (typeof reference !== 'string') {
    return undefined;
  }
  const match = REFERENCE_PATTERN.exec(reference);
  const type = match?.[1];
  const id = match?.[2];
  return type === undefined || id === undefined ? undefined : { type, id };
}

/** Canonical relative form `Type/id` of a reference of the given type, or `undefined`. */
export function canonicalReference(reference: unknown, type: string): string | undefined {
  const parsed = parseReference(reference);
  return parsed?.type === type ? `${parsed.type}/${parsed.id}` : undefined;
}

function invalidPatientContext(): ForbiddenException {
  return new ForbiddenException({ errorCode: 'COMPARTMENT_VIOLATION', message: 'Token carries an invalid patient context' });
}

/**
 * The SMART `patient` launch claim is a bare Patient id (auth-service contract);
 * FHIR writes and searches need `Patient/{id}`. A claim that is already a
 * Patient reference is accepted too; anything else fails closed.
 */
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

/** Patient compartment of the caller as `Patient/{id}` — from the token only (ADR-013). */
export function requirePatientReference(claims: JwtClaims): string {
  return toPatientReference(requirePatientRef(claims));
}
