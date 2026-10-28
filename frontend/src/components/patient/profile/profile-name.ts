import type { AccountProfile, PatientProfile } from '../patient-types';

/** «Фамилия Имя» of the account, else of the card, else of the account parts; `''` when nothing is known. */
export function displayName(account: AccountProfile | undefined, patient: PatientProfile | null | undefined): string {
  const fromParts: string = patient === null || patient === undefined ? '' : [patient.lastName, patient.firstName].filter(Boolean).join(' ');
  return account?.name ?? (fromParts !== '' ? fromParts : account !== undefined ? `${account.lastName} ${account.firstName}`.trim() : '');
}

/** Two letters of the name for the round avatar: the first of the surname and of the given name. */
export function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => Array.from(part)[0]?.toUpperCase() ?? '').join('');
}

/** The given name for a greeting («Здравствуйте, Павел»); `''` when it is not known. */
export function givenNameOf(account: AccountProfile | undefined, patient: PatientProfile | null | undefined): string {
  const given: string = (patient?.firstName ?? account?.firstName ?? '').trim();
  return given;
}
