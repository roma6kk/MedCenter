import { clearEnvCache, loadEnv, parseEnv, parseGuardEnv } from './env.schema';

const validSource: NodeJS.ProcessEnv = {
  FHIR_BASE_URL: 'http://hapi:8080/fhir',
  FHIR_CLIENT_ID: 'medcenter-bff',
  FHIR_CLIENT_SECRET: 'do-not-commit-me',
  JWT_JWKS_URI: 'https://api.medcenter.by/.well-known/jwks.json',
  JWT_ISSUER: 'https://api.medcenter.by',
  REDIS_URL: 'redis://redis:6379',
  RABBITMQ_URL: 'amqp://rabbitmq:5672',
};

describe('envSchema', () => {
  it('should apply documented defaults when optional values are absent', () => {
    const env = parseEnv(validSource);

    expect(env.PORT).toBe(3000);
    expect(env.RATE_LIMIT_PER_MINUTE).toBe(120);
    expect(env.NODE_ENV).toBe('development');
    expect(env.TERMINOLOGY_UPSTREAM_URL).toBeUndefined();
  });

  it('should reject configuration that omits a secret', () => {
    const incomplete: NodeJS.ProcessEnv = { ...validSource };
    delete incomplete['FHIR_CLIENT_SECRET'];

    expect(() => parseEnv(incomplete)).toThrow();
  });

  it('should reject a non-URL FHIR base address', () => {
    const invalid: NodeJS.ProcessEnv = { ...validSource, FHIR_BASE_URL: 'not-a-url' };

    expect(() => parseEnv(invalid)).toThrow();
  });
});

describe('parseGuardEnv', () => {
  it('should validate only the keys the shared guard stack depends on', () => {
    const guardEnv = parseGuardEnv({
      JWT_JWKS_URI: validSource['JWT_JWKS_URI'],
      JWT_ISSUER: validSource['JWT_ISSUER'],
      REDIS_URL: validSource['REDIS_URL'],
    });

    expect(guardEnv.RATE_LIMIT_PER_MINUTE).toBe(120);
    expect(guardEnv).not.toHaveProperty('FHIR_BASE_URL');
  });
});

describe('loadEnv', () => {
  it('should parse once and reuse the cached environment', () => {
    clearEnvCache();

    const first = loadEnv(validSource);
    const second = loadEnv({});

    expect(second).toBe(first);
    clearEnvCache();
  });
});
