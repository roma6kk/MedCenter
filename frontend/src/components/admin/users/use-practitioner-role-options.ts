'use client';

import { useMemo } from 'react';
import { useDoctors } from '@/components/catalog/use-catalog';
import type { Doctor } from '@/components/catalog/catalog-types';
import { useT } from '@/lib/i18n/use-t';
import { useAdminUsers } from './use-admin-users';
import { referenceId, type AdminUser } from './user-types';

export interface PractitionerRoleOption {
  readonly value: string;
  readonly label: string;
  /** Linked to another account: the server would answer `PRACTITIONER_ROLE_TAKEN`. */
  readonly disabled: boolean;
}

/** `pending` while the catalog loads; `unavailable` when it failed, so the form falls back to typing the id. */
export type PractitionerRoleChoices =
  | { readonly state: 'pending' }
  | { readonly state: 'unavailable' }
  | { readonly state: 'ready'; readonly options: ReadonlyArray<PractitionerRoleOption> };

const ALL_PAGE_SIZE = 100;

interface OptionInput {
  readonly doctors: ReadonlyArray<Doctor>;
  readonly accounts: ReadonlyArray<AdminUser>;
  /** The account being edited (its own link is no conflict); `undefined` for a new account. */
  readonly userId: string | undefined;
  /** The value already in the form: kept on offer even when the catalog does not list it. */
  readonly current: string;
  readonly takenBy: (name: string) => string;
}

/** One option per active PractitionerRole of the catalog, sorted by doctor; roles linked to another account are disabled. */
export function practitionerRoleOptionsOf({ doctors, accounts, userId, current, takenBy }: OptionInput): ReadonlyArray<PractitionerRoleOption> {
  const owners = new Map<string, string>();
  accounts.forEach((account) => {
    if (account.practitionerRoleRef !== null && account.id !== userId) owners.set(referenceId(account.practitionerRoleRef), account.name);
  });
  const options: PractitionerRoleOption[] = [];
  [...doctors]
    .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'ru'))
    .forEach((doctor) => {
      const roleIds: ReadonlyArray<string> = doctor.practitionerRoleIds ?? [];
      roleIds.forEach((roleId) => {
        const base: string = [`${doctor.lastName} ${doctor.firstName}`, doctor.specialty].filter((part) => part !== undefined && part !== '').join(' · ');
        const named: string = roleIds.length > 1 ? `${base} (${roleId.slice(0, 8)})` : base;
        const owner: string | undefined = owners.get(roleId);
        options.push({ value: roleId, label: owner === undefined ? named : `${named} — ${takenBy(owner)}`, disabled: owner !== undefined });
      });
    });
  if (current !== '' && !options.some((option) => option.value === current)) options.push({ value: current, label: current, disabled: false });
  return options;
}

/**
 * The PractitionerRoles a DOCTOR account can be linked to: `GET /doctors` lists each doctor's `practitionerRoleIds`, and the
 * DOCTOR accounts tell which roles are already linked. Without the account list nothing is marked, the server still decides.
 */
export function usePractitionerRoleOptions(userId: string | undefined, current: string): PractitionerRoleChoices {
  const t = useT('admin.users');
  const doctors = useDoctors({ pageSize: ALL_PAGE_SIZE });
  const accounts = useAdminUsers({ page: 1, role: 'DOCTOR', search: '', pageSize: ALL_PAGE_SIZE });
  const doctorItems = doctors.data?.items;
  const accountItems = accounts.data?.items;
  return useMemo((): PractitionerRoleChoices => {
    if (doctorItems === undefined) return doctors.isError ? { state: 'unavailable' } : { state: 'pending' };
    const takenBy = (name: string): string => t('roleTakenBy', { name });
    return { state: 'ready', options: practitionerRoleOptionsOf({ doctors: doctorItems, accounts: accountItems ?? [], userId, current, takenBy }) };
  }, [doctorItems, accountItems, doctors.isError, userId, current, t]);
}
