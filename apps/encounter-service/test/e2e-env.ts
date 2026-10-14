import { generateKeyPairSync } from 'node:crypto';

export const E2E_ISSUER = 'https://api.medcenter.by';
export const E2E_FHIR_BASE = 'http://hapi:8080/fhir';

/**
 * The guard stack (`JwtAuthGuard`) resolves its verifier configuration eagerly,
 * so a suite that boots `AppModule` must declare the environment *before*
 * `Test.createTestingModule(...).compile()`.
 */
export function applyE2eEnv(): void {
  const { publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  process.env['JWT_PUBLIC_KEY'] = publicKey;
  process.env['JWT_ISSUER'] = E2E_ISSUER;
  process.env['JWT_KEY_ID'] = 'e2e-1';
  process.env['JWT_JWKS_URI'] = `${E2E_ISSUER}/.well-known/jwks.json`;
  process.env['FHIR_BASE_URL'] = E2E_FHIR_BASE;
  process.env['REDIS_URL'] = 'redis://localhost:6379';
  process.env['RABBITMQ_URL'] = 'amqp://localhost:5672';
  process.env['RATE_LIMIT_PER_MINUTE'] = '1000';
}
