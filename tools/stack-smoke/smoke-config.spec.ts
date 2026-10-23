import { DEFAULT_MANIFEST_PATH, readSmokeConfig } from './smoke-config';

describe('readSmokeConfig', () => {
  it('should default to the Traefik dev edge, the seed manifest and the web OAuth client', () => {
    expect(readSmokeConfig({})).toEqual({
      baseUrl: 'http://localhost:8081',
      manifestPath: DEFAULT_MANIFEST_PATH,
      oauthClientId: 'medcenter-web',
      redirectUri: 'http://localhost:3000/api/auth/callback',
      pollTimeoutMs: 120_000,
      pollIntervalMs: 2_500,
      requestTimeoutMs: 60_000,
      fhirBaseUrl: 'http://localhost:8080/fhir',
    });
  });

  it('should leave the consent enforcement mode unset (the consent chain detects it) unless SMOKE_CONSENT_ENFORCEMENT names it', () => {
    expect(readSmokeConfig({}).consentEnforcement).toBeUndefined();
    expect(readSmokeConfig({ SMOKE_CONSENT_ENFORCEMENT: 'warn' }).consentEnforcement).toBe('warn');
    expect(readSmokeConfig({ SMOKE_CONSENT_ENFORCEMENT: 'block' }).consentEnforcement).toBe('block');
    expect(() => readSmokeConfig({ SMOKE_CONSENT_ENFORCEMENT: 'off' })).toThrow('SMOKE_CONSENT_ENFORCEMENT must be warn or block');
  });

  it('should read HAPI for the audit check from SMOKE_FHIR_BASE_URL and keep it local', () => {
    expect(readSmokeConfig({ SMOKE_FHIR_BASE_URL: 'http://127.0.0.1:18080/fhir/' }).fhirBaseUrl).toBe('http://127.0.0.1:18080/fhir');
    expect(() => readSmokeConfig({ SMOKE_FHIR_BASE_URL: 'https://hapi.example.com/fhir' })).toThrow('SMOKE_FHIR_BASE_URL points at hapi.example.com');
  });

  it('should take overrides from the environment and trim the trailing slash of the base URL', () => {
    const config = readSmokeConfig({ SMOKE_BASE_URL: 'https://localhost:443/', SMOKE_POLL_TIMEOUT_MS: '5000' });

    expect([config.baseUrl, config.pollTimeoutMs]).toEqual(['https://localhost:443', 5000]);
  });

  it('should read the per-request timeout from SMOKE_REQUEST_TIMEOUT_MS and refuse a non-positive one', () => {
    expect(readSmokeConfig({ SMOKE_REQUEST_TIMEOUT_MS: '15000' }).requestTimeoutMs).toBe(15_000);
    expect(() => readSmokeConfig({ SMOKE_REQUEST_TIMEOUT_MS: '0' })).toThrow('SMOKE_REQUEST_TIMEOUT_MS must be a positive number');
  });

  it('should treat an empty variable as unset', () => {
    expect(readSmokeConfig({ SMOKE_BASE_URL: '  ' }).baseUrl).toBe('http://localhost:8081');
  });

  it.each(['0', '-5', 'soon'])('should refuse a poll timeout of %s', (value) => {
    expect(() => readSmokeConfig({ SMOKE_POLL_TIMEOUT_MS: value })).toThrow('SMOKE_POLL_TIMEOUT_MS must be a positive number');
  });

  it('should refuse a SMOKE_BASE_URL that is not a local host, since the suite creates users and deletes data', () => {
    expect(() => readSmokeConfig({ SMOKE_BASE_URL: 'https://stand.example.com' })).toThrow('SMOKE_BASE_URL points at stand.example.com');
  });

  it('should run against another host only when SMOKE_ALLOW_REMOTE=true says so', () => {
    jest.spyOn(console, 'warn').mockImplementation();

    expect(readSmokeConfig({ SMOKE_BASE_URL: 'https://stand.example.com', SMOKE_ALLOW_REMOTE: 'true' }).baseUrl).toBe('https://stand.example.com');
    jest.restoreAllMocks();
  });
});
