import {
  clearEnvCache,
  loadEnv,
  parseEnv,
  parseGuardEnv,
  parseJwtSigningEnv,
} from './env.schema';

const validSource: NodeJS.ProcessEnv = {
  FHIR_BASE_URL: 'http://hapi:8080/fhir',
  FHIR_CLIENT_ID: 'medcenter-bff',
  FHIR_CLIENT_SECRET: 'do-not-commit-me',
  JWT_JWKS_URI: 'https://api.medcenter.by/.well-known/jwks.json',
  JWT_ISSUER: 'https://api.medcenter.by',
  REDIS_URL: 'redis://redis:6379',
  RABBITMQ_URL: 'amqp://rabbitmq:5672',
};

const signingSource: NodeJS.ProcessEnv = {
  ...validSource,
  JWT_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----',
  JWT_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\nkey\n-----END PUBLIC KEY-----',
};

describe('envSchema', () => {
  it('should apply documented defaults when optional values are absent', () => {
    const env = parseEnv(validSource);

    expect(env.PORT).toBe(3000);
    expect(env.RATE_LIMIT_PER_MINUTE).toBe(120);
    expect(env.NODE_ENV).toBe('development');
    expect(env.TERMINOLOGY_UPSTREAM_URL).toBeUndefined();
  });

  it('should default CONSENT_ENFORCEMENT to block and accept warn', () => {
    expect(parseEnv(validSource).CONSENT_ENFORCEMENT).toBe('block');
    expect(parseEnv({ ...validSource, CONSENT_ENFORCEMENT: 'warn' }).CONSENT_ENFORCEMENT).toBe('warn');
  });

  it('should reject a CONSENT_ENFORCEMENT value other than warn or block', () => {
    expect(() => parseEnv({ ...validSource, CONSENT_ENFORCEMENT: 'off' })).toThrow();
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

  it('should leave the signing keys optional for services that never sign', () => {
    expect(parseEnv(validSource).JWT_PRIVATE_KEY).toBeUndefined();
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

describe('parseJwtSigningEnv', () => {
  it('should return the key pair when both PEM values are present', () => {
    const signing = parseJwtSigningEnv(signingSource);

    expect(signing.JWT_PRIVATE_KEY).toContain('BEGIN PRIVATE KEY');
    expect(signing.JWT_PUBLIC_KEY).toContain('BEGIN PUBLIC KEY');
  });

  it('should throw when the private half of the signing key is missing', () => {
    const incomplete: NodeJS.ProcessEnv = { ...signingSource };
    delete incomplete['JWT_PRIVATE_KEY'];

    expect(() => parseJwtSigningEnv(incomplete)).toThrow();
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
