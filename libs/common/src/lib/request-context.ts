/**
 * Claims carried by a SMART on FHIR access token (ADR-013).
 *
 * `resolvePatientRef` is the single source of the patient compartment: the
 * `patient` query parameter of a request is never trusted for `patient/*`
 * scopes — it must be ignored by controllers and services alike.
 */
export interface JwtClaims {
  readonly sub: string;
  readonly scope: string;
  readonly role: string;
  readonly patient?: string;
  readonly fhirUser?: string;
  readonly jti: string;
}

/** Any HTTP request that may carry authenticated claims attached by `JwtAuthGuard`. */
export interface RequestWithClaims {
  user?: JwtClaims;
}

export function hasScope(claims: JwtClaims, required: string): boolean {
  return claims.scope.split(' ').includes(required);
}

export function resolvePatientRef(claims: JwtClaims): string | null {
  return claims.patient ?? null;
}
