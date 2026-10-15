import { createPublicKey, createSign, generateKeyPairSync, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { E2E_ISSUER } from './e2e-env';

const KEY_ID = 'e2e-1';
const TOKEN_TTL_SECONDS = 900;

/**
 * Claims a test token carries — the contract auth-service issues (sub, role,
 * scope, patient, fhirUser). `role` is a plain string so negative suites can
 * send a role auth-service never issues.
 */
export interface TestTokenClaims {
  readonly role: string;
  readonly scope: string;
  readonly patient?: string;
  readonly fhirUser?: string;
}

/** Deviations from a valid token, for suites that prove a token is refused. */
export interface TestTokenOptions {
  /** Lifetime relative to now; a negative value signs an already expired token. */
  readonly expiresInSeconds?: number;
  /** `iss` claim; defaults to the issuer the service trusts. */
  readonly issuer?: string;
}

export interface TestIssuer {
  readonly jwksUri: string;
  sign(claims: TestTokenClaims, options?: TestTokenOptions): string;
  close(): Promise<void>;
}

const base64url = (value: string): string => Buffer.from(value).toString('base64url');

/**
 * A stand-in for auth-service: serves an RS256 JWKS on an ephemeral local port
 * and signs access tokens with the matching private key, so the real
 * `JwtAuthGuard` verifies every token the suite sends.
 */
export async function startTestIssuer(): Promise<TestIssuer> {
  const keys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const jwk = createPublicKey(keys.publicKey).export({ format: 'jwk' });
  const body = JSON.stringify({ keys: [{ ...jwk, kid: KEY_ID, alg: 'RS256', use: 'sig' }] });
  const server = createServer((req, res) => {
    if (req.url === '/.well-known/jwks.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(body);
      return;
    }
    res.writeHead(404).end();
  });
  const port = await listen(server);

  return {
    jwksUri: `http://127.0.0.1:${port}/.well-known/jwks.json`,
    sign: (claims, options = {}) => signToken(keys.privateKey, claims, options),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });
}

function signToken(privateKey: string, claims: TestTokenClaims, options: TestTokenOptions): string {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (options.expiresInSeconds ?? TOKEN_TTL_SECONDS);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KEY_ID }));
  const payload = base64url(
    JSON.stringify({
      iss: options.issuer ?? E2E_ISSUER,
      sub: `user-${randomUUID()}`,
      jti: randomUUID(),
      iat: now,
      exp,
      ...claims,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(privateKey, 'base64url')}`;
}
