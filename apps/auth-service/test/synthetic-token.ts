import { randomUUID } from 'node:crypto';

/** The claims `JwtAuthGuard` reads from a verified access token (`libs/common` `JwtClaims`). */
export interface SyntheticClaims {
  readonly sub: string;
  readonly scope: string;
  readonly role: string;
  readonly jti?: string;
  readonly patient?: string;
  readonly fhirUser?: string;
}

function segment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/**
 * An access token as the e2e `jose` stub reads it (see {@link joseStub}): the payload is whatever
 * the suite claims. It lets a spec exercise a scope or role combination the OAuth server would
 * never issue (an ADMIN holding only `user/*.read`), without touching the signing keys.
 */
export function syntheticToken(claims: SyntheticClaims): string {
  return `${segment({ alg: 'RS256', typ: 'JWT' })}.${segment({ jti: randomUUID(), ...claims })}.signature`;
}

export function syntheticBearer(claims: SyntheticClaims): string {
  return `Bearer ${syntheticToken(claims)}`;
}

/** A token whose payload is exactly `payload` (no generated `jti`): for tokens that miss a claim the guard needs. */
export function rawBearer(payload: Readonly<Record<string, unknown>>): string {
  return `Bearer ${segment({ alg: 'RS256', typ: 'JWT' })}.${segment(payload)}.signature`;
}

/**
 * `jose` is pure ESM and Jest's CJS runtime cannot load it, so every e2e suite replaces it. The
 * stub accepts any token and returns its payload, i.e. the claims of the token the application
 * actually signed (or of a {@link syntheticToken}). Used as
 * `jest.mock('jose', () => jest.requireActual<typeof import('./synthetic-token')>('./synthetic-token').joseStub)`.
 */
export const joseStub = {
  createRemoteJWKSet: (): string => 'mocked-jwks',
  jwtVerify: async (
    token: string,
  ): Promise<{ payload: unknown; protectedHeader: { alg: string } }> => {
    const payload: unknown = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    );
    return { payload, protectedHeader: { alg: 'RS256' } };
  },
};
