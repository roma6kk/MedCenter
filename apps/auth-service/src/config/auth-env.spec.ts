import {
  isCookieSecureForced,
  normaliseEmail,
  parseBootstrapAdminEnv,
  parseDatabaseEnv,
  readSessionSecret,
} from './auth-env';

const STRONG = 'Adm1n!Passw0rd';

describe('parseDatabaseEnv', () => {
  it('should prefer the AUTH_DB_* keys when both families are set', () => {
    const connection = parseDatabaseEnv({
      AUTH_DB_HOST: 'postgres',
      AUTH_DB_PORT: '5432',
      AUTH_DB_PASSWORD: 'auth-pass',
      POSTGRES_PORT: '5433',
      POSTGRES_PASSWORD: 'compose-pass',
    });

    expect(connection).toEqual({
      host: 'postgres',
      port: 5432,
      username: 'medcenter',
      password: 'auth-pass',
      database: 'medcenter',
    });
  });

  it('should fall back to the compose POSTGRES_* keys when AUTH_DB_* is unset', () => {
    const connection = parseDatabaseEnv({ POSTGRES_PORT: '5433', POSTGRES_PASSWORD: 'p', POSTGRES_DB: 'db' });

    expect(connection).toMatchObject({ host: 'localhost', port: 5433, password: 'p', database: 'db' });
  });

  it('should use the compose DB_* keys over POSTGRES_* when AUTH_DB_* is unset', () => {
    const connection = parseDatabaseEnv({
      DB_HOST: 'postgres',
      DB_PORT: '5432',
      DB_USERNAME: 'medcenter',
      DB_PASSWORD: 'compose-db',
      DB_NAME: 'medcenter',
      POSTGRES_PORT: '5433',
      POSTGRES_PASSWORD: 'host-pass',
    });

    expect(connection).toEqual({
      host: 'postgres',
      port: 5432,
      username: 'medcenter',
      password: 'compose-db',
      database: 'medcenter',
    });
  });

  it('should throw when no password is configured', () => {
    expect(() => parseDatabaseEnv({ AUTH_DB_HOST: 'postgres' })).toThrow(/AUTH_DB_PASSWORD/);
  });

  it('should treat an empty variable as unset when it parses the port', () => {
    expect(parseDatabaseEnv({ AUTH_DB_PORT: '', POSTGRES_PASSWORD: 'p' }).port).toBe(5432);
  });

  it('should reject a port that is not a number', () => {
    expect(() => parseDatabaseEnv({ AUTH_DB_PORT: 'x', POSTGRES_PASSWORD: 'p' })).toThrow();
  });
});

describe('parseBootstrapAdminEnv', () => {
  it('should return null when no bootstrap account is configured', () => {
    expect(parseBootstrapAdminEnv({})).toBeNull();
  });

  it('should normalise the email and apply default names when the pair is set', () => {
    const admin = parseBootstrapAdminEnv({
      BOOTSTRAP_ADMIN_EMAIL: ' Admin@MedCenter.by ',
      BOOTSTRAP_ADMIN_PASSWORD: STRONG,
    });

    expect(admin).toEqual({
      email: 'admin@medcenter.by',
      password: STRONG,
      firstName: 'Администратор',
      lastName: 'Системный',
    });
  });

  it('should throw when only one half of the pair is set', () => {
    expect(() => parseBootstrapAdminEnv({ BOOTSTRAP_ADMIN_EMAIL: 'a@b.by' })).toThrow(/together/);
  });

  it('should throw when the bootstrap password is weak', () => {
    expect(() =>
      parseBootstrapAdminEnv({ BOOTSTRAP_ADMIN_EMAIL: 'a@b.by', BOOTSTRAP_ADMIN_PASSWORD: 'short' }),
    ).toThrow(/password policy/);
  });

  it('should throw when the bootstrap email is malformed', () => {
    expect(() =>
      parseBootstrapAdminEnv({ BOOTSTRAP_ADMIN_EMAIL: 'not-an-email', BOOTSTRAP_ADMIN_PASSWORD: STRONG }),
    ).toThrow(/valid email/);
  });
});

describe('normaliseEmail', () => {
  it('should trim and lower-case the address when it is mixed case', () => {
    expect(normaliseEmail('  Ivanov@Example.BY ')).toBe('ivanov@example.by');
  });
});

describe('readSessionSecret', () => {
  it('should prefer AUTH_SESSION_SECRET when it is set', () => {
    const secret = 's'.repeat(32);

    expect(readSessionSecret({ AUTH_SESSION_SECRET: secret, JWT_PRIVATE_KEY: 'pem' })).toBe(secret);
  });

  it('should fall back to the signing key when no dedicated secret is set', () => {
    expect(readSessionSecret({ JWT_PRIVATE_KEY: 'pem' })).toBe('pem');
  });

  it('should reject a dedicated secret shorter than 32 characters', () => {
    expect(() => readSessionSecret({ AUTH_SESSION_SECRET: 'short', JWT_PRIVATE_KEY: 'pem' })).toThrow();
  });

  it('should throw when neither secret is available', () => {
    expect(() => readSessionSecret({})).toThrow(/AUTH_SESSION_SECRET/);
  });
});

describe('isCookieSecureForced', () => {
  it('should force Secure cookies when AUTH_COOKIE_SECURE is true', () => {
    expect(isCookieSecureForced({ AUTH_COOKIE_SECURE: 'true' })).toBe(true);
  });

  it('should leave the decision to the request when the variable is unset or false', () => {
    expect(isCookieSecureForced({})).toBe(false);
    expect(isCookieSecureForced({ AUTH_COOKIE_SECURE: '' })).toBe(false);
    expect(isCookieSecureForced({ AUTH_COOKIE_SECURE: 'false' })).toBe(false);
  });

  it('should reject a value that is not a boolean literal', () => {
    expect(() => isCookieSecureForced({ AUTH_COOKIE_SECURE: 'yes' })).toThrow();
  });

  it('should follow the variable when its value changes between calls', () => {
    expect(isCookieSecureForced({ AUTH_COOKIE_SECURE: 'true' })).toBe(true);
    expect(isCookieSecureForced({ AUTH_COOKIE_SECURE: 'false' })).toBe(false);
    expect(isCookieSecureForced({ AUTH_COOKIE_SECURE: 'true' })).toBe(true);
    expect(isCookieSecureForced({})).toBe(false);
  });

  it('should keep rejecting an invalid value after a valid one was remembered', () => {
    isCookieSecureForced({ AUTH_COOKIE_SECURE: 'true' });

    expect(() => isCookieSecureForced({ AUTH_COOKIE_SECURE: 'yes' })).toThrow();
    expect(() => isCookieSecureForced({ AUTH_COOKIE_SECURE: 'yes' })).toThrow();
  });
});
