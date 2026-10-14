import { randomUUID } from 'node:crypto';

import { E2E_ISSUER } from './e2e-env';

/**
 * Bearer tokens for suites that stub `jose` (signature verification is
 * covered by `libs/common` and by `jwt-perimeter.e2e-spec.ts`): the guard stack
 * still decodes these claims, so scopes, roles and `fhirUser` are exercised
 * exactly as auth-service issues them.
 */
export interface E2eClaims {
  readonly role: 'PATIENT' | 'DOCTOR' | 'ADMIN';
  readonly scope: string;
  readonly fhirUser?: string;
  readonly patient?: string;
}

const base64url = (value: string): string => Buffer.from(value).toString('base64url');

export function bearer(claims: E2eClaims): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'e2e-1' }));
  const payload = base64url(
    JSON.stringify({
      iss: E2E_ISSUER,
      sub: `user-${randomUUID()}`,
      jti: randomUUID(),
      exp: Math.floor(Date.now() / 1000) + 900,
      ...claims,
    }),
  );
  return `Bearer ${header}.${payload}.unsigned`;
}

/** Decode-only stand-in for `jose.jwtVerify`, for `jest.mock('jose', ...)`. */
export function decodeOnlyJose(): Record<string, unknown> {
  return {
    createRemoteJWKSet: (): string => 'mocked-jwks',
    jwtVerify: async (token: string): Promise<{ payload: unknown; protectedHeader: { alg: string } }> => {
      const segment = token.split('.')[1] ?? '';
      return {
        payload: JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as unknown,
        protectedHeader: { alg: 'RS256' },
      };
    },
  };
}

export const DOCTOR_SCOPE = 'user/*.read user/*.write launch';
export const PATIENT_SCOPE = 'patient/*.read patient/*.write launch';
