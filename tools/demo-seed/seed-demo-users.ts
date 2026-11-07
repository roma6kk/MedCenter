import type { FetchLike } from '../shared/fhir-http';
import { ADMINS, DOCTORS, PATIENTS } from './demo-catalog';
import { resolvePassword } from './demo-credentials';
import { demoIds } from './demo-ids';
import type { DemoUserRecord, DemoUsersSection } from './demo-manifest';
import { assertAdminGrant } from './demo-admin-grant';
import { obtainTokenGrant, type OAuthConfig } from './oauth-pkce-client';

export interface UsersSeedConfig {
  readonly withDemoAdmin: boolean;
  readonly oauth: OAuthConfig;
  readonly apiBaseUrl: string;
  readonly admin: { readonly email: string; readonly password: string };
  readonly emailDomain: string;
  readonly adminPasswordFromEnv?: string;
  readonly doctorPasswordFromEnv?: string;
  readonly patientPasswordFromEnv?: string;
  readonly previous?: DemoUsersSection;
  readonly now: Date;
}

export interface PlannedAccount {
  readonly role: DemoUserRecord['role'];
  readonly email: string;
  readonly path: string;
  readonly body: Readonly<Record<string, unknown>>;
  readonly practitionerRoleId?: string;
  readonly password: string;
}

const ERROR_EXCERPT_LENGTH = 300;

const DEMO_ACCOUNT_CONSENT_VERSION = '2026-10';

export function emailOf(local: string, domain: string): string {
  return `${local}@${domain}`;
}

function previousPassword(config: UsersSeedConfig, email: string): string | undefined {
  return config.previous?.accounts.find((account) => account.email === email)?.password;
}

export function planAdminAccounts(config: UsersSeedConfig): PlannedAccount[] {
  return ADMINS.map((admin) => {
    const email = emailOf(admin.emailLocal, config.emailDomain);
    const password = resolvePassword({ fromEnv: config.adminPasswordFromEnv, fromManifest: previousPassword(config, email) });
    const body = { email, password, firstName: admin.firstName, lastName: admin.lastName, roles: ['ADMIN'] };
    return { role: 'ADMIN', email, path: '/api/v1/admin/users', password, body };
  });
}

export function planDoctorAccounts(config: UsersSeedConfig): PlannedAccount[] {
  return DOCTORS.map((doctor) => {
    const email = emailOf(doctor.emailLocal, config.emailDomain);
    const practitionerRoleId = demoIds.practitionerRole(doctor.key);
    const password = resolvePassword({
      fromEnv: config.doctorPasswordFromEnv,
      fromManifest: previousPassword(config, email),
    });
    return {
      role: 'DOCTOR',
      email,
      path: '/api/v1/admin/users',
      practitionerRoleId,
      password,
      body: {
        email,
        password,
        firstName: doctor.given,
        lastName: doctor.family,
        roles: ['DOCTOR'],
        practitionerRoleId,
      },
    };
  });
}

export function planPatientAccounts(config: UsersSeedConfig): PlannedAccount[] {
  return PATIENTS.map((patient) => {
    const email = emailOf(patient.emailLocal, config.emailDomain);
    const password = resolvePassword({
      fromEnv: config.patientPasswordFromEnv,
      fromManifest: previousPassword(config, email),
    });
    return {
      role: 'PATIENT',
      email,
      path: '/api/v1/auth/register',
      password,
      body: {
        email,
        password,
        firstName: patient.firstName,
        lastName: patient.lastName,
        birthDate: patient.birthDate,
        gender: patient.gender,
        accountConsent: { accepted: true, textVersion: DEMO_ACCOUNT_CONSENT_VERSION },
      },
    };
  });
}

async function post(
  config: UsersSeedConfig,
  account: PlannedAccount,
  token: string,
  fetchImpl: FetchLike,
): Promise<{ readonly status: number; readonly text: string }> {
  const response = await fetchImpl(`${config.apiBaseUrl}${account.path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(account.role === 'PATIENT' ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(account.body),
  });
  return { status: response.status, text: await response.text() };
}

const EMAIL_TAKEN_MARKER = 'EMAIL_TAKEN';

function existingAccountRecord(base: RecordBase, known: string | undefined): DemoUserRecord {
  return {
    ...base,
    ...(known === undefined ? {} : { password: known }),
    status: 'exists',
    detail:
      known === undefined
        ? 'account already exists; its password is not in the manifest (set DEMO_*_PASSWORD or reset the user)'
        : 'account already exists; password kept from the previous run',
  };
}

type RecordBase = Pick<DemoUserRecord, 'role' | 'email' | 'practitionerRoleId'>;

function recordBase(account: PlannedAccount): RecordBase {
  return {
    role: account.role,
    email: account.email,
    ...(account.practitionerRoleId === undefined ? {} : { practitionerRoleId: account.practitionerRoleId }),
  };
}

function createdDetails(text: string): Pick<DemoUserRecord, 'userId' | 'detail'> {
  try {
    const created = JSON.parse(text) as { id?: unknown } | null;
    return typeof created?.id === 'string' ? { userId: created.id } : {};
  } catch (error: unknown) {
    return { detail: `account created, but the answer was not JSON (${errorText(error)}); userId unknown` };
  }
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, ERROR_EXCERPT_LENGTH);
}

// Outcome unknown (the account may exist): keep the generated password so a re-run stays consistent.
export function toRejectedRecord(account: PlannedAccount, error: unknown): DemoUserRecord {
  return {
    ...recordBase(account),
    password: account.password,
    status: 'failed',
    detail: `request did not complete (${errorText(error)}); the account may exist, re-run to reconcile`,
  };
}

export function toUserRecord(
  config: UsersSeedConfig,
  account: PlannedAccount,
  answer: { readonly status: number; readonly text: string },
): DemoUserRecord {
  const base = recordBase(account);
  if (answer.status === 201) {
    return { ...base, ...createdDetails(answer.text), password: account.password, status: 'created' };
  }
  if (answer.status === 409 && answer.text.includes(EMAIL_TAKEN_MARKER)) {
    return existingAccountRecord(base, previousPassword(config, account.email));
  }
  return { ...base, status: 'failed', detail: `HTTP ${answer.status}: ${answer.text.slice(0, ERROR_EXCERPT_LENGTH)}` };
}

async function seedAccount(
  config: UsersSeedConfig,
  account: PlannedAccount,
  token: string,
  fetchImpl: FetchLike,
): Promise<DemoUserRecord> {
  try {
    return toUserRecord(config, account, await post(config, account, token, fetchImpl));
  } catch (error: unknown) {
    return toRejectedRecord(account, error);
  }
}

function sectionOf(config: UsersSeedConfig, accounts: readonly DemoUserRecord[]): DemoUsersSection {
  return { generatedAt: config.now.toISOString(), authBaseUrl: config.oauth.authBaseUrl, accounts };
}

function sectionSoFar(config: UsersSeedConfig, done: readonly DemoUserRecord[]): DemoUsersSection {
  const doneEmails = new Set(done.map((record) => record.email));
  const pending = (config.previous?.accounts ?? []).filter((record) => !doneEmails.has(record.email));
  return sectionOf(config, [...done, ...pending]);
}

export type UsersProgress = (section: DemoUsersSection) => Promise<void>;

function earlierDemoAdmins(config: UsersSeedConfig): DemoUserRecord[] {
  return (config.previous?.accounts ?? []).filter((record) => record.role === 'ADMIN' && record.email !== config.admin.email);
}

export async function seedDemoUsers(
  config: UsersSeedConfig,
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
  onProgress?: UsersProgress,
): Promise<DemoUsersSection> {
  const grant = await obtainTokenGrant(config.oauth, config.admin, fetchImpl);
  assertAdminGrant(config.oauth.clientId, grant.scope);
  const token = grant.accessToken;
  const records: DemoUserRecord[] = [{ role: 'ADMIN', email: config.admin.email, status: 'exists' }, ...(config.withDemoAdmin ? [] : earlierDemoAdmins(config))];
  const admins = config.withDemoAdmin ? planAdminAccounts(config) : [];
  for (const account of [...admins, ...planDoctorAccounts(config), ...planPatientAccounts(config)]) {
    const record = await seedAccount(config, account, token, fetchImpl);
    console.log(`${record.status.padEnd(7)} ${record.role.padEnd(7)} ${record.email}`);
    records.push(record);
    await onProgress?.(sectionSoFar(config, records));
  }
  return sectionOf(config, records);
}
