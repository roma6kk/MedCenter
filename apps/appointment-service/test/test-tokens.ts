import { createPublicKey, createSign, generateKeyPairSync, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { E2E_ISSUER } from './e2e-env';

const KEY_ID = 'e2e-1';

/** Base64url without padding, as JWS requires. */
const base64url = (value: Buffer | string): string => Buffer.from(value).toString('base64url');

/** Claims an e2e token carries on top of `iss`, `jti` and `exp`. */
export interface TestTokenClaims {
  readonly sub: string;
  readonly role: 'PATIENT' | 'DOCTOR' | 'ADMIN';
  readonly scope: string;
  readonly patient?: string;
  readonly fhirUser?: string;
}

/**
 * RS256 issuer for e2e suites: serves its public key as a JWKS on a random
 * local port, so `JwtAuthGuard` verifies the tokens it signs exactly as it
 * verifies auth-service tokens.
 */
export interface TestIssuer {
  readonly jwksUri: string;
  sign(claims: TestTokenClaims): string;
  close(): Promise<void>;
}

function signWith(privateKey: string, claims: TestTokenClaims): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KEY_ID }));
  const payload = base64url(
    JSON.stringify({ ...claims, iss: E2E_ISSUER, jti: randomUUID(), exp: Math.floor(Date.now() / 1000) + 900 }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(privateKey, 'base64url')}`;
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}/.well-known/jwks.json`);
    });
  });
}

export async function startTestIssuer(): Promise<TestIssuer> {
  const keys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const publicJwk = createPublicKey(keys.publicKey).export({ format: 'jwk' });
  const body = JSON.stringify({ keys: [{ ...publicJwk, kid: KEY_ID, alg: 'RS256', use: 'sig' }] });
  const server = createServer((req, res) => {
    if (req.url === '/.well-known/jwks.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(body);
      return;
    }
    res.writeHead(404).end();
  });
  const jwksUri = await listen(server);

  return {
    jwksUri,
    sign: (claims) => signWith(keys.privateKey, claims),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
