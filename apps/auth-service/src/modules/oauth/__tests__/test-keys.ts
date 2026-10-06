import { generateKeyPairSync } from 'node:crypto';

import type { RegisteredClient } from '../guards/client.guard';
import type { SigningKeys } from '../jwt.service';

export const TEST_ISSUER = 'https://api.medcenter.by';

/** Deterministic-enough RS256 key pair generated once per spec file. */
export function createTestKeys(): SigningKeys {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  return { privateKeyPem: privateKey, publicKeyPem: publicKey, issuer: TEST_ISSUER, kid: 'auth-test' };
}

export const TEST_REDIRECT_URI = 'https://app.medcenter.by/api/auth/callback';

export function createTestClient(overrides: Partial<RegisteredClient> = {}): RegisteredClient {
  return {
    clientId: 'medcenter-web',
    redirectUris: [TEST_REDIRECT_URI],
    scopes: ['launch', 'patient/*.read', 'patient/*.write', 'user/*.read', 'user/*.write'],
    isPublic: true,
    ...overrides,
  };
}
