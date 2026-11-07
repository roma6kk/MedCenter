import type { AccountProfile, PatientProfile } from '../patient-types';

export function displayName(account: AccountProfile | undefined, patient: PatientProfile | null | undefined): string {
  const fromParts: string = patient === null || patient === undefined ? '' : [patient.lastName, patient.firstName].filter(Boolean).join(' ');
  return account?.name ?? (fromParts !== '' ? fromParts : account !== undefined ? `${account.lastName} ${account.firstName}`.trim() : '');
}

export function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => Array.from(part)[0]?.toUpperCase() ?? '').join('');
}

export function givenNameOf(account: AccountProfile | undefined, patient: PatientProfile | null | undefined): string {
  return (patient?.firstName ?? account?.firstName ?? '').trim();
}
