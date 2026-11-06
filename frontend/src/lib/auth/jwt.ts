// Unverified decode for the UI only, never a trust boundary: every BFF validates the token itself.

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
