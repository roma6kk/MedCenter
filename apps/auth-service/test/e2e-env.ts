import { generateKeyPairSync } from 'node:crypto';

export const E2E_ISSUER = 'https://api.medcenter.by';
export const E2E_CLIENT_ID = 'medcenter-web';
export const E2E_CONFIDENTIAL_CLIENT_ID = 'medcenter-server';
export const E2E_CONFIDENTIAL_SECRET = 'server-secret-e2e';
export const E2E_KEY_ID = 'e2e-1';
export const E2E_REDIRECT_URI = 'https://app.medcenter.by/api/auth/callback';
export const E2E_FHIR_BASE = 'http://hapi:8080/fhir';

/**
 * `AppModule` mounts the OAuth surface, whose signing keys are resolved by an
 * **eager** provider factory, so a suite that boots the app must declare the
 * environment the app needs *before* `Test.createTestingModule(...).compile()`.
 * Without this the whole app fails to instantiate — not just the OAuth routes.
 */
export function applyE2eEnv(): void {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  process.env['JWT_PRIVATE_KEY'] = privateKey;
  process.env['JWT_PUBLIC_KEY'] = publicKey;
  process.env['JWT_ISSUER'] = E2E_ISSUER;
  process.env['JWT_KEY_ID'] = E2E_KEY_ID;
  // `parseJwtEnv` (the guard's verifier configuration) requires this, and it is
  // the endpoint this very service publishes under `.well-known/jwks.json`.
  process.env['JWT_JWKS_URI'] = `${E2E_ISSUER}/.well-known/jwks.json`;
  process.env['FHIR_BASE_URL'] = E2E_FHIR_BASE;
  process.env['OAUTH_CLIENTS_JSON'] = JSON.stringify([
    {
      clientId: E2E_CLIENT_ID,
      redirectUris: [E2E_REDIRECT_URI],
      scopes: ['launch', 'patient/*.read', 'patient/*.write'],
      isPublic: true,
    },
    {
      clientId: E2E_CONFIDENTIAL_CLIENT_ID,
      redirectUris: [E2E_REDIRECT_URI],
      scopes: ['launch', 'user/*.read'],
      isPublic: false,
      clientSecret: E2E_CONFIDENTIAL_SECRET,
    },
  ]);
}
