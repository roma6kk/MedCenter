/** SMART claims. `resolvePatientRef` is the only source of the patient compartment: the `patient` query parameter is never trusted for `patient/*` scopes. */
export interface JwtClaims {
  readonly sub: string;
  readonly scope: string;
  readonly role: string;
  readonly patient?: string;
  readonly fhirUser?: string;
  readonly jti: string;
  readonly sid?: string;
}

export interface RequestWithClaims {
  user?: JwtClaims;
}

export function hasScope(claims: JwtClaims, required: string): boolean {
  return claims.scope.split(' ').includes(required);
}

export function resolvePatientRef(claims: JwtClaims): string | null {
  return claims.patient ?? null;
}
