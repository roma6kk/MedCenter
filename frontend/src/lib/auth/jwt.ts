/**
 * jwt — unverified JWT payload decoding for the token-broker route handlers.
 *
 * The access token is issued and verified by `auth-service` (RS256, JWKS).
 * The Next.js server never needs to verify the signature — it only needs the
 * claims to shape the session response and the UI. Decoding is therefore
 * deliberately best-effort and MUST NOT be treated as a trust boundary:
 * every BFF still validates the token cryptographically.
 */

export interface JwtClaims {
  readonly sub?: string;
  readonly scope?: string;
  readonly role?: string;
  readonly patient?: string;
  readonly patientRef?: string;
  readonly fhirUser?: string;
  readonly exp?: number;
}

export function decodeJwtPayload(token: string): JwtClaims | null {
  const parts: string[] = token.split('.');
  if (parts.length !== 3) return null;
  const segment: string | undefined = parts[1];
  if (segment === undefined || segment.length === 0) return null;
  try {
    const base64: string = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded: string = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json: string = atob(padded);
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as JwtClaims;
  } catch {
    return null;
  }
}
