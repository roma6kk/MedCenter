/** Test support: an unsigned JWT shaped like auth-service's access token (the broker only decodes the payload). */

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function fakeAccessToken(claims: Readonly<Record<string, unknown>> = {}): string {
  const payload = { sub: 'user-1', role: 'PATIENT', scope: 'launch patient/*.read patient/*.write', patient: '1439', ...claims };
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

export function tokenEndpointBody(overrides: Readonly<Record<string, unknown>> = {}): Readonly<Record<string, unknown>> {
  return { access_token: fakeAccessToken(), refresh_token: 'refresh-next', expires_in: 900, token_type: 'Bearer', ...overrides };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
