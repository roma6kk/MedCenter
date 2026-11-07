import { randomUUID } from 'node:crypto';

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

export function syntheticToken(claims: SyntheticClaims): string {
  return `${segment({ alg: 'RS256', typ: 'JWT' })}.${segment({ jti: randomUUID(), ...claims })}.signature`;
}

export function syntheticBearer(claims: SyntheticClaims): string {
  return `Bearer ${syntheticToken(claims)}`;
}

export function rawBearer(payload: Readonly<Record<string, unknown>>): string {
  return `Bearer ${segment({ alg: 'RS256', typ: 'JWT' })}.${segment(payload)}.signature`;
}

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
