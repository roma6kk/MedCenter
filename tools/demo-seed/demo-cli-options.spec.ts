import {
  ADMIN_SCOPE,
  DEFAULT_AUTH_BASE_URL,
  DEFAULT_DEMO_EMAIL_DOMAIN,
  DEFAULT_OAUTH_CLIENT_ID,
  DEFAULT_OAUTH_REDIRECT_URI,
  MAX_SLOT_DAYS,
  parseCliArgs,
  readUsersConfig,
} from './demo-cli-options';

const NOW = new Date('2026-11-02T10:00:00.000Z');
const ADMIN_ENV = { BOOTSTRAP_ADMIN_EMAIL: 'admin@medcenter.test', BOOTSTRAP_ADMIN_PASSWORD: 'Adm1n!Passw0rd' };

describe('parseCliArgs', () => {
  it('should run the FHIR part for 14 days from today when called without arguments', () => {
    expect(parseCliArgs([])).toEqual({ runFhir: true, runUsers: false, days: 14 });
  });

  it('should run only the users step for --users', () => {
    expect(parseCliArgs(['--users'])).toMatchObject({ runFhir: false, runUsers: true });
  });

  it('should run both steps for --fhir --users', () => {
    expect(parseCliArgs(['--fhir', '--users'])).toMatchObject({ runFhir: true, runUsers: true });
  });

  it('should read the slot horizon from --days and --from', () => {
    expect(parseCliArgs(['--days=30', '--from=2026-11-09'])).toMatchObject({ days: 30, from: '2026-11-09' });
  });

  it.each(['--days=0', '--days=91', '--days=abc', '--days=2.5'])('should reject %s because the service caps a horizon at 90 days', (argument) => {
    expect(() => parseCliArgs([argument])).toThrow(`--days must be an integer between 1 and ${MAX_SLOT_DAYS}`);
  });

  it.each(['--from=2026-13-40', '--from=tomorrow'])('should reject %s as a start date', (argument) => {
    expect(() => parseCliArgs([argument])).toThrow(/--from must be a date/);
  });

  it('should reject an unknown argument and name the supported ones', () => {
    expect(() => parseCliArgs(['--wipe'])).toThrow(/Unknown argument "--wipe"/);
  });

  it('should reject a flag without a value', () => {
    expect(() => parseCliArgs(['--days='])).toThrow(/--days needs a value/);
  });
});

describe('readUsersConfig', () => {
  it('should default to the Traefik dev edge, the web client and the demo domain', () => {
    const config = readUsersConfig(ADMIN_ENV, undefined, NOW);

    expect(config.oauth).toEqual({
      authBaseUrl: DEFAULT_AUTH_BASE_URL,
      clientId: DEFAULT_OAUTH_CLIENT_ID,
      redirectUri: DEFAULT_OAUTH_REDIRECT_URI,
      scope: ADMIN_SCOPE,
    });
    expect(config.emailDomain).toBe(DEFAULT_DEMO_EMAIL_DOMAIN);
    expect(config.admin).toEqual({ email: 'admin@medcenter.test', password: 'Adm1n!Passw0rd' });
  });

  it('should ask for the full admin scope that user management needs', () => {
    expect(ADMIN_SCOPE.split(' ')).toEqual(['launch', 'user/*.read', 'user/*.write']);
  });

  it('should honour overrides and drop trailing slashes of the auth origin', () => {
    const config = readUsersConfig(
      { ...ADMIN_ENV, SEED_AUTH_BASE_URL: 'http://auth.test:3001//', OAUTH_CLIENT_ID: 'seed-client', DEMO_EMAIL_DOMAIN: 'demo.test' },
      undefined,
      NOW,
    );

    expect(config.oauth.authBaseUrl).toBe('http://auth.test:3001');
    expect(config.apiBaseUrl).toBe('http://auth.test:3001');
    expect(config.oauth.clientId).toBe('seed-client');
    expect(config.emailDomain).toBe('demo.test');
  });

  it('should name the missing admin variable without echoing the other one', () => {
    expect(() => readUsersConfig({ BOOTSTRAP_ADMIN_EMAIL: 'admin@medcenter.test' }, undefined, NOW)).toThrow(
      'Environment variable BOOTSTRAP_ADMIN_PASSWORD is required',
    );
  });

  it('should pass the previous manifest section and the password overrides through', () => {
    const previous = { generatedAt: 'x', authBaseUrl: 'y', accounts: [] };

    const config = readUsersConfig({ ...ADMIN_ENV, DEMO_DOCTOR_PASSWORD: 'D0ctor!Pass12' }, previous, NOW);

    expect(config.previous).toBe(previous);
    expect(config.doctorPasswordFromEnv).toBe('D0ctor!Pass12');
    expect(config.patientPasswordFromEnv).toBeUndefined();
  });
});
