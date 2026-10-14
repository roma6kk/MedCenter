import type { FetchLike } from '../shared/fhir-http';
import { DOCTORS, PATIENTS } from './demo-catalog';
import { resolvePassword } from './demo-credentials';
import { demoIds } from './demo-ids';
import type { DemoUserRecord, DemoUsersSection } from './demo-manifest';
import { obtainAccessToken, type OAuthConfig } from './oauth-pkce-client';

/**
 * User part of the demo seed (separate step: `seed:demo -- --users`). It talks
 * to auth-service through its public API (API §2.2) as the bootstrap ADMIN:
 *
 * - DOCTOR accounts via `POST /api/v1/admin/users` with `practitionerRoleId`
 *   (the seeded PractitionerRole), so the doctor's token carries `fhirUser`;
 * - PATIENT accounts via the public `POST /api/v1/auth/register`, which also
 *   provisions the FHIR `Patient`.
 *
 * Must run AFTER auth-service is deployed and the FHIR part has run (the role
 * ids must exist in HAPI: the service checks them before linking). Not yet
 * exercised against a live auth-service — the request shapes were taken from
 * its controllers/DTOs and are covered by unit and contract tests.
 *
 * Re-running is safe: a taken email answers `409` with `EMAIL_TAKEN`, which is
 * recorded as `exists` and keeps the password an earlier run generated. Any
 * other `409` (e.g. `PRACTITIONER_ROLE_TAKEN`) is a real conflict and fails.
 *
 * Generated passwords live only in the manifest, so nothing here may lose them:
 * a request that rejects (network, auth-service restart) or an unreadable 201
 * body becomes one `failed`/`created` record instead of aborting the run, and
 * the caller can persist the manifest after every account (`onProgress`).
 */

export interface UsersSeedConfig {
  readonly oauth: OAuthConfig;
  /** Origin of `/api/v1/*`, normally the same Traefik edge as `oauth.authBaseUrl`. */
  readonly apiBaseUrl: string;
  readonly admin: { readonly email: string; readonly password: string };
  readonly emailDomain: string;
  readonly doctorPasswordFromEnv?: string;
  readonly patientPasswordFromEnv?: string;
  readonly previous?: DemoUsersSection;
  readonly now: Date;
}

export interface PlannedAccount {
  readonly role: 'DOCTOR' | 'PATIENT';
  readonly email: string;
  /** Request path and JSON body (the body carries the password; it is never logged). */
  readonly path: string;
  readonly body: Readonly<Record<string, unknown>>;
  readonly practitionerRoleId?: string;
  readonly password: string;
}

const ERROR_EXCERPT_LENGTH = 300;

export function emailOf(local: string, domain: string): string {
  return `${local}@${domain}`;
}

function previousPassword(config: UsersSeedConfig, email: string): string | undefined {
  return config.previous?.accounts.find((account) => account.email === email)?.password;
}

/** DOCTOR accounts, linked to the seeded PractitionerRoles by their deterministic ids. */
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

/** PATIENT accounts, self-registered (the FHIR `Patient` is created by auth-service). */
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
      // Registration is public; only the admin endpoint needs the Bearer token.
      ...(account.role === 'DOCTOR' ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(account.body),
  });
  return { status: response.status, text: await response.text() };
}

/** `409` of a repeated email — the only conflict that means "this account is already there". */
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

/**
 * A 201 means the account exists with the generated password, so a body that
 * is not JSON must not turn that into an error: the id is just left out.
 */
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

/**
 * The request itself rejected (network, auth-service restart): the outcome is
 * unknown, because the account may have been created before the answer was
 * lost. The password is therefore kept, so a re-run (which reuses it, then
 * meets `EMAIL_TAKEN` if the account was created) stays consistent.
 */
export function toRejectedRecord(account: PlannedAccount, error: unknown): DemoUserRecord {
  return {
    ...recordBase(account),
    password: account.password,
    status: 'failed',
    detail: `request did not complete (${errorText(error)}); the account may exist, re-run to reconcile`,
  };
}

/**
 * Pure mapping of an API answer to the manifest record: 201 -> `created` (with
 * the generated password), 409 `EMAIL_TAKEN` -> `exists` (the earlier run's
 * password, if any — the generated one was never applied), anything else ->
 * `failed`. Never throws.
 */
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

/**
 * The section as it stands after some accounts: the records of this run, then
 * the previous manifest's records for accounts not reached yet — so an
 * interrupted re-run never drops a password the earlier run recorded.
 */
function sectionOf(config: UsersSeedConfig, accounts: readonly DemoUserRecord[]): DemoUsersSection {
  return { generatedAt: config.now.toISOString(), authBaseUrl: config.oauth.authBaseUrl, accounts };
}

function sectionSoFar(config: UsersSeedConfig, done: readonly DemoUserRecord[]): DemoUsersSection {
  const doneEmails = new Set(done.map((record) => record.email));
  const pending = (config.previous?.accounts ?? []).filter((record) => !doneEmails.has(record.email));
  return sectionOf(config, [...done, ...pending]);
}

/** Called with the section after every account, so the caller can persist it before the next request. */
export type UsersProgress = (section: DemoUsersSection) => Promise<void>;

/** Creates the demo doctors and patients; the admin account itself is the bootstrap one and is only listed. */
export async function seedDemoUsers(
  config: UsersSeedConfig,
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
  onProgress?: UsersProgress,
): Promise<DemoUsersSection> {
  const token = await obtainAccessToken(config.oauth, config.admin, fetchImpl);
  const records: DemoUserRecord[] = [{ role: 'ADMIN', email: config.admin.email, status: 'exists' }];
  for (const account of [...planDoctorAccounts(config), ...planPatientAccounts(config)]) {
    const record = await seedAccount(config, account, token, fetchImpl);
    console.log(`${record.status.padEnd(7)} ${record.role.padEnd(7)} ${record.email}`);
    records.push(record);
    await onProgress?.(sectionSoFar(config, records));
  }
  return sectionOf(config, records);
}
