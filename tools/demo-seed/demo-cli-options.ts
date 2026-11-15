import { assertLocalTarget } from '../shared/local-target';
import { readOptionalEnv, requireEnv } from '../shared/seed-env';
import { DEFAULT_SLOT_DAYS } from './demo-catalog';
import type { DemoUsersSection } from './demo-manifest';
import type { UsersSeedConfig } from './seed-demo-users';

export const MAX_SLOT_DAYS = 90;

export interface CliOptions {
  readonly runFhir: boolean;
  readonly runUsers: boolean;
  readonly runRepair: boolean;
  readonly runConsents: boolean;
  readonly consentExcept?: string;
  readonly withAdmin: boolean;
  readonly refreshScans: boolean;
  readonly days: number;
  readonly from?: string;
}

const SWITCHES = ['--fhir', '--users', '--repair', '--consents', '--with-admin', '--refresh-scans'] as const;
const VALUED = ['--consent-except', '--days', '--from'] as const;

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

export function parseCliArgs(argv: readonly string[]): CliOptions {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  for (const argument of argv) {
    const flag = SWITCHES.find((candidate) => candidate === argument);
    const valued = VALUED.find((candidate) => argument.startsWith(`${candidate}=`));
    if (flag !== undefined) {
      flags.add(flag);
    } else if (valued !== undefined) {
      values.set(valued, readValue(argument, valued));
    } else {
      throw new Error(`Unknown argument "${argument}" (supported: ${[...SWITCHES, '--consent-except=<account|none>', '--days=N', '--from=YYYY-MM-DD'].join(', ')})`);
    }
  }
  assertFlagCombination(flags, values);
  return optionsOf(flags, values);
}

function assertFlagCombination(flags: ReadonlySet<string>, values: ReadonlyMap<string, string>): void {
  if (flags.has('--with-admin') && !flags.has('--users')) {
    throw new Error('--with-admin belongs to the users step: add --users');
  }
  if (flags.has('--refresh-scans') && !flags.has('--consents')) {
    throw new Error('--refresh-scans belongs to the consents step: add --consents');
  }
  if (values.has('--consent-except') && !flags.has('--consents')) {
    throw new Error('--consent-except belongs to the consents step: add --consents');
  }
}

function optionsOf(flags: ReadonlySet<string>, values: ReadonlyMap<string, string>): CliOptions {
  const runUsers = flags.has('--users');
  const runRepair = flags.has('--repair');
  const runConsents = flags.has('--consents');
  const consentExcept = values.get('--consent-except');
  const from = values.get('--from');
  return {
    runFhir: flags.has('--fhir') || (!runUsers && !runRepair && !runConsents),
    runUsers,
    runRepair,
    runConsents,
    withAdmin: flags.has('--with-admin'),
    refreshScans: flags.has('--refresh-scans'),
    days: parseDays(values.get('--days') ?? String(DEFAULT_SLOT_DAYS)),
    ...(consentExcept === undefined ? {} : { consentExcept }),
    ...(from === undefined ? {} : { from: parseFrom(from) }),
  };
}

export const DEFAULT_AUTH_BASE_URL = 'http://localhost:8081';
export const DEFAULT_OAUTH_CLIENT_ID = 'medcenter-web';
export const DEFAULT_OAUTH_REDIRECT_URI = 'http://localhost:3000/api/auth/callback';
export const DEFAULT_DEMO_EMAIL_DOMAIN = 'medcenter.test';
export const ADMIN_SCOPE = 'launch user/*.read user/*.write';

export function readUsersConfig(
  env: NodeJS.ProcessEnv,
  previous: DemoUsersSection | undefined,
  now: Date,
  withAdmin = false,
): UsersSeedConfig {
  const authBaseUrl = (readOptionalEnv(env, 'SEED_AUTH_BASE_URL') ?? DEFAULT_AUTH_BASE_URL).replace(/\/+$/, '');
  assertLocalTarget('SEED_AUTH_BASE_URL', authBaseUrl, 'SEED_ALLOW_REMOTE', env);
  return {
    withDemoAdmin: withAdmin,
    oauth: {
      authBaseUrl,
      clientId: readOptionalEnv(env, 'OAUTH_CLIENT_ID') ?? DEFAULT_OAUTH_CLIENT_ID,
      redirectUri: readOptionalEnv(env, 'OAUTH_REDIRECT_URI') ?? DEFAULT_OAUTH_REDIRECT_URI,
      scope: ADMIN_SCOPE,
    },
    apiBaseUrl: authBaseUrl,
    admin: { email: requireEnv(env, 'BOOTSTRAP_ADMIN_EMAIL'), password: requireEnv(env, 'BOOTSTRAP_ADMIN_PASSWORD') },
    emailDomain: readOptionalEnv(env, 'DEMO_EMAIL_DOMAIN') ?? DEFAULT_DEMO_EMAIL_DOMAIN,
    adminPasswordFromEnv: readOptionalEnv(env, 'DEMO_ADMIN_PASSWORD'),
    doctorPasswordFromEnv: readOptionalEnv(env, 'DEMO_DOCTOR_PASSWORD'),
    patientPasswordFromEnv: readOptionalEnv(env, 'DEMO_PATIENT_PASSWORD'),
    ...(previous === undefined ? {} : { previous }),
    now,
  };
}
