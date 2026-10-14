import { readOptionalEnv, requireEnv } from '../shared/seed-env';
import { DEFAULT_SLOT_DAYS } from './demo-catalog';
import type { DemoUsersSection } from './demo-manifest';
import type { UsersSeedConfig } from './seed-demo-users';

/** The service caps one planning horizon at 90 days (API §5.2.5), so the seed never exceeds it. */
export const MAX_SLOT_DAYS = 90;

export interface CliOptions {
  readonly runFhir: boolean;
  readonly runUsers: boolean;
  readonly days: number;
  /** First slot day (clinic calendar, Europe/Minsk), `YYYY-MM-DD`; today in Minsk when omitted. */
  readonly from?: string;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function readValue(argument: string, flag: string): string {
  const value = argument.slice(flag.length + 1);
  if (value.length === 0) {
    throw new Error(`${flag} needs a value (${flag}=...)`);
  }
  return value;
}

function parseDays(raw: string): number {
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > MAX_SLOT_DAYS) {
    throw new Error(`--days must be an integer between 1 and ${MAX_SLOT_DAYS}`);
  }
  return days;
}

function parseFrom(raw: string): string {
  if (!DAY_PATTERN.test(raw) || Number.isNaN(Date.parse(raw))) {
    throw new Error('--from must be a date (YYYY-MM-DD)');
  }
  return raw;
}

/**
 * `seed:demo` alone runs the FHIR part. `--users` runs the user part only;
 * `--fhir --users` runs both, FHIR first. `--days=N` / `--from=YYYY-MM-DD`
 * shape the slot horizon (default: 14 days from today).
 */
export function parseCliArgs(argv: readonly string[]): CliOptions {
  let runFhir = false;
  let runUsers = false;
  let days = DEFAULT_SLOT_DAYS;
  let from: string | undefined;
  for (const argument of argv) {
    if (argument === '--fhir') {
      runFhir = true;
    } else if (argument === '--users') {
      runUsers = true;
    } else if (argument.startsWith('--days=')) {
      days = parseDays(readValue(argument, '--days'));
    } else if (argument.startsWith('--from=')) {
      from = parseFrom(readValue(argument, '--from'));
    } else {
      throw new Error(`Unknown argument "${argument}" (supported: --fhir, --users, --days=N, --from=YYYY-MM-DD)`);
    }
  }
  return { runFhir: runFhir || !runUsers, runUsers, days, ...(from === undefined ? {} : { from }) };
}

export const DEFAULT_AUTH_BASE_URL = 'http://localhost:8081';
export const DEFAULT_OAUTH_CLIENT_ID = 'medcenter-web';
export const DEFAULT_OAUTH_REDIRECT_URI = 'http://localhost:3000/api/auth/callback';
export const DEFAULT_DEMO_EMAIL_DOMAIN = 'medcenter.test';
export const ADMIN_SCOPE = 'launch user/*.read user/*.write';

/**
 * Settings of the user step from the environment. The admin credentials are
 * the bootstrap account's (`BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`);
 * nothing here has a default for a secret.
 */
export function readUsersConfig(
  env: NodeJS.ProcessEnv,
  previous: DemoUsersSection | undefined,
  now: Date,
): UsersSeedConfig {
  const authBaseUrl = (readOptionalEnv(env, 'SEED_AUTH_BASE_URL') ?? DEFAULT_AUTH_BASE_URL).replace(/\/+$/, '');
  return {
    oauth: {
      authBaseUrl,
      clientId: readOptionalEnv(env, 'OAUTH_CLIENT_ID') ?? DEFAULT_OAUTH_CLIENT_ID,
      redirectUri: readOptionalEnv(env, 'OAUTH_REDIRECT_URI') ?? DEFAULT_OAUTH_REDIRECT_URI,
      scope: ADMIN_SCOPE,
    },
    apiBaseUrl: authBaseUrl,
    admin: { email: requireEnv(env, 'BOOTSTRAP_ADMIN_EMAIL'), password: requireEnv(env, 'BOOTSTRAP_ADMIN_PASSWORD') },
    emailDomain: readOptionalEnv(env, 'DEMO_EMAIL_DOMAIN') ?? DEFAULT_DEMO_EMAIL_DOMAIN,
    doctorPasswordFromEnv: readOptionalEnv(env, 'DEMO_DOCTOR_PASSWORD'),
    patientPasswordFromEnv: readOptionalEnv(env, 'DEMO_PATIENT_PASSWORD'),
    ...(previous === undefined ? {} : { previous }),
    now,
  };
}
