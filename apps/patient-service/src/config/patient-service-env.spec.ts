import { parsePatientServiceEnv } from './patient-service-env';

const validEnv: NodeJS.ProcessEnv = {
  FHIR_BASE_URL: 'http://hapi:8080/fhir',
  JWT_JWKS_URI: 'http://auth-service:3001/.well-known/jwks.json',
  JWT_ISSUER: 'https://api.medcenter.by',
  REDIS_URL: 'redis://redis:6379',
};

describe('parsePatientServiceEnv', () => {
  it('should default PORT to 3004 when PORT is not set', () => {
    expect(parsePatientServiceEnv(validEnv).PORT).toBe(3004);
  });

  it('should accept a deployment without FHIR client credentials when HAPI is unauthenticated', () => {
    const env = parsePatientServiceEnv(validEnv);

    expect(env.FHIR_CLIENT_ID).toBeUndefined();
    expect(env.FHIR_CLIENT_SECRET).toBeUndefined();
  });

  it('should reject the environment when FHIR_BASE_URL is missing', () => {
    const withoutFhir: NodeJS.ProcessEnv = { ...validEnv, FHIR_BASE_URL: undefined };

    expect(() => parsePatientServiceEnv(withoutFhir)).toThrow();
  });

  it('should reject the environment when only one FHIR client credential is set', () => {
    expect(() => parsePatientServiceEnv({ ...validEnv, FHIR_CLIENT_ID: 'patient-service' })).toThrow();
  });

  it('should accept FHIR client credentials when both of them are set', () => {
    const env = parsePatientServiceEnv({ ...validEnv, FHIR_CLIENT_ID: 'patient-service', FHIR_CLIENT_SECRET: 'test-secret' });

    expect(env.FHIR_CLIENT_ID).toBe('patient-service');
  });

  it('should coerce PORT to a number when it comes from the environment as a string', () => {
    expect(parsePatientServiceEnv({ ...validEnv, PORT: '4004' }).PORT).toBe(4004);
  });

  it('should reject the environment when PORT is not a positive integer', () => {
    expect(() => parsePatientServiceEnv({ ...validEnv, PORT: '-1' })).toThrow();
  });

  it('should reject the environment when JWT_JWKS_URI is missing', () => {
    expect(() => parsePatientServiceEnv({ ...validEnv, JWT_JWKS_URI: undefined })).toThrow();
  });

  it('should not require RABBITMQ_URL when the service publishes no events', () => {
    expect(() => parsePatientServiceEnv(validEnv)).not.toThrow();
  });
});
