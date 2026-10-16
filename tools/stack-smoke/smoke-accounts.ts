import { readManifest, type DemoManifest, type DemoUserRecord } from '../demo-seed/demo-manifest';
import type { SmokeAccount } from './smoke-types';

/** The logins the suite needs, picked from the seed manifest. */
export interface SmokeAccounts {
  readonly admin: SmokeAccount;
  /** The doctor whose `PractitionerRole` owns the clinical chain (the first demo doctor). */
  readonly doctor: SmokeAccount;
  /** A second doctor: the "wrong doctor" of the compartment checks. */
  readonly otherDoctor: SmokeAccount;
  readonly patient: SmokeAccount;
  readonly otherPatient: SmokeAccount;
  readonly thirdPatient: SmokeAccount;
  /** `Practitioner.id` of `doctor` (what `GET /doctors/{id}/slots` takes). */
  readonly doctorId: string;
  readonly doctorRoleId: string;
}

type WithPassword = DemoUserRecord & { readonly password: string };

function hasPassword(record: DemoUserRecord): record is WithPassword {
  return typeof record.password === 'string' && record.password.length > 0 && record.status !== 'failed';
}

function toAccount(record: WithPassword): SmokeAccount {
  return {
    role: record.role,
    email: record.email,
    password: record.password,
    ...(record.practitionerRoleId === undefined ? {} : { practitionerRoleId: record.practitionerRoleId }),
  };
}

function pick(records: readonly DemoUserRecord[], role: DemoUserRecord['role'], index: number): SmokeAccount {
  const account = records.filter((record) => record.role === role).filter(hasPassword).map(toAccount)[index];
  if (account === undefined) {
    const seed = role === 'ADMIN' ? 'npm run seed:demo -- --users --with-admin' : 'npm run seed:demo -- --users';
    throw new Error(
      `The manifest has no ${role} account #${index + 1} with a password: run "${seed}" first ` +
        '(the bootstrap admin has no password in the manifest; the demo admin the suite signs in as is opt-in, --with-admin).',
    );
  }
  return account;
}

function practitionerIdOf(manifest: DemoManifest, roleId: string): string {
  const role = manifest.practitionerRoles?.find((candidate) => candidate.id === roleId);
  if (role === undefined) {
    throw new Error(`PractitionerRole ${roleId} is not in the manifest FHIR part: run "npm run seed:demo" first`);
  }
  return role.practitionerId;
}

/** Pure: the suite's accounts from a manifest. Throws a message naming the seed step that is missing. */
export function pickAccounts(manifest: DemoManifest): SmokeAccounts {
  const records = manifest.users?.accounts ?? [];
  const doctor = pick(records, 'DOCTOR', 0);
  const doctorRoleId = doctor.practitionerRoleId ?? '';
  return {
    admin: pick(records, 'ADMIN', 0),
    doctor,
    otherDoctor: pick(records, 'DOCTOR', 1),
    patient: pick(records, 'PATIENT', 0),
    otherPatient: pick(records, 'PATIENT', 1),
    thirdPatient: pick(records, 'PATIENT', 2),
    doctorId: practitionerIdOf(manifest, doctorRoleId),
    doctorRoleId,
  };
}

export async function loadAccounts(manifestPath: string): Promise<SmokeAccounts> {
  return pickAccounts(await readManifest(manifestPath));
}
