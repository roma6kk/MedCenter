import { isStrongPassword } from 'class-validator';
import { z } from 'zod';

/**
 * Environment of the auth-specific infrastructure: the `auth` schema
 * connection, the bootstrap ADMIN account and the login-session secret.
 * Secrets have no defaults and are only ever read from the environment.
 */

/** Same policy as `RegisterPatientDto.password` (API §2.2.6). */
export const PASSWORD_POLICY = {
  minLength: 10,
  minLowercase: 1,
  minUppercase: 1,
  minNumbers: 1,
  minSymbols: 1,
} as const;

/**
 * Accounts are keyed by a trimmed, lower-cased email everywhere (registration,
 * admin CRUD, login, bootstrap), so `Ivanov@Example.by` cannot shadow
 * `ivanov@example.by`.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** An empty variable (`FOO=`) means "unset", never an empty secret or host. */
const optionalText = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const optionalPort = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.coerce.number().int().min(1).max(65535).optional(),
);

const databaseEnvSchema = z.object({
  AUTH_DB_HOST: optionalText,
  AUTH_DB_PORT: optionalPort,
  AUTH_DB_USER: optionalText,
  AUTH_DB_PASSWORD: optionalText,
  AUTH_DB_NAME: optionalText,
  DB_HOST: optionalText,
  DB_PORT: optionalPort,
  DB_USERNAME: optionalText,
  DB_PASSWORD: optionalText,
  DB_NAME: optionalText,
  POSTGRES_PORT: optionalPort,
  POSTGRES_USER: optionalText,
  POSTGRES_PASSWORD: optionalText,
  POSTGRES_DB: optionalText,
});

export interface DatabaseConnectionEnv {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly database: string;
}

/**
 * Precedence: `AUTH_DB_*` (service-specific override) → `DB_*` (the compose
 * `x-db-env` fragment: `postgres:5432` inside the compose network) →
 * `POSTGRES_*` (the stack's own `.env`, so a host-run `nx serve` reaches the
 * published port).
 */
export function parseDatabaseEnv(source: NodeJS.ProcessEnv): DatabaseConnectionEnv {
  const env = databaseEnvSchema.parse(source);
  const password = env.AUTH_DB_PASSWORD ?? env.DB_PASSWORD ?? env.POSTGRES_PASSWORD;
  if (password === undefined) {
    throw new Error('AUTH_DB_PASSWORD (or DB_PASSWORD / POSTGRES_PASSWORD) is required to open the auth schema');
  }
  return {
    host: env.AUTH_DB_HOST ?? env.DB_HOST ?? 'localhost',
    port: env.AUTH_DB_PORT ?? env.DB_PORT ?? env.POSTGRES_PORT ?? 5432,
    username: env.AUTH_DB_USER ?? env.DB_USERNAME ?? env.POSTGRES_USER ?? 'medcenter',
    password,
    database: env.AUTH_DB_NAME ?? env.DB_NAME ?? env.POSTGRES_DB ?? 'medcenter',
  };
}

export interface BootstrapAdminEnv {
  readonly email: string;
  readonly password: string;
  readonly firstName: string;
  readonly lastName: string;
}

const bootstrapAdminSchema = z.object({
  BOOTSTRAP_ADMIN_EMAIL: optionalText,
  BOOTSTRAP_ADMIN_PASSWORD: optionalText,
  BOOTSTRAP_ADMIN_FIRST_NAME: optionalText,
  BOOTSTRAP_ADMIN_LAST_NAME: optionalText,
});

/**
 * `null` when no bootstrap account is configured. A half-configured pair, a
 * malformed email or a weak password fails the boot instead of silently
 * creating (or skipping) an administrator.
 */
export function parseBootstrapAdminEnv(source: NodeJS.ProcessEnv): BootstrapAdminEnv | null {
  const env = bootstrapAdminSchema.parse(source);
  const email = env.BOOTSTRAP_ADMIN_EMAIL;
  const password = env.BOOTSTRAP_ADMIN_PASSWORD;
  if (email === undefined && password === undefined) {
    return null;
  }
  if (email === undefined || password === undefined) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be set together');
  }
  const normalisedEmail = normaliseEmail(email);
  if (!z.email().safeParse(normalisedEmail).success) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL is not a valid email address');
  }
  if (!isStrongPassword(password, PASSWORD_POLICY)) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD does not satisfy the password policy');
  }
  return {
    email: normalisedEmail,
    password,
    firstName: env.BOOTSTRAP_ADMIN_FIRST_NAME ?? 'Администратор',
    lastName: env.BOOTSTRAP_ADMIN_LAST_NAME ?? 'Системный',
  };
}

const sessionSecretSchema = z.object({
  AUTH_SESSION_SECRET: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(32).optional(),
  ),
  JWT_PRIVATE_KEY: optionalText,
});

/**
 * Input keying material for the login-session cookies. A dedicated
 * `AUTH_SESSION_SECRET` (≥ 32 chars) is preferred; without it the RS256
 * private key — already a mandatory secret of this service — is used as IKM,
 * and HKDF (`login-session.keys.ts`) separates the derived keys from it.
 */
export function readSessionSecret(source: NodeJS.ProcessEnv): string {
  const env = sessionSecretSchema.parse(source);
  const secret = env.AUTH_SESSION_SECRET ?? env.JWT_PRIVATE_KEY;
  if (secret === undefined) {
    throw new Error('AUTH_SESSION_SECRET (or JWT_PRIVATE_KEY) is required to sign login sessions');
  }
  return secret;
}

const cookieSecureSchema = z.object({
  AUTH_COOKIE_SECURE: z.preprocess((value) => (value === '' ? undefined : value), z.enum(['true', 'false']).optional()),
});

/**
 * `AUTH_COOKIE_SECURE=true` forces the `Secure` attribute on the login cookies
 * even when the request does not look like TLS (e.g. a TLS terminator that
 * sends no `X-Forwarded-Proto`). Unset → decided per request (`req.secure`).
 */
export function isCookieSecureForced(source: NodeJS.ProcessEnv): boolean {
  const raw = source['AUTH_COOKIE_SECURE'];
  if (cookieSecureMemo !== null && cookieSecureMemo.raw === raw) {
    return cookieSecureMemo.forced;
  }
  const forced = cookieSecureSchema.parse(source).AUTH_COOKIE_SECURE === 'true';
  cookieSecureMemo = { raw, forced };
  return forced;
}

/** Asked for on every login response; the variable is parsed again only when its text changes. */
let cookieSecureMemo: { readonly raw: string | undefined; readonly forced: boolean } | null = null;
