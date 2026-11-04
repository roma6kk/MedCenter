'use client';

import { useDoctors } from '@/components/catalog/use-catalog';
import { initialsOf } from '@/components/doctor/journal-model';
import { useAccount } from '@/components/patient/use-patient-queries';
import { doctorLabel } from '@/lib/doctor-name';
import { useT } from '@/lib/i18n/use-t';
import { roleIdOf } from '@/lib/practitioner-role-id';
import { useSessionStore } from '@/store/use-session-store';

export interface StaffProfile {
  /** Full name as the account shows it; the role word until the account is read. */
  readonly name: string;
  /** The doctor's specialty, else the role word. */
  readonly subtitle: string;
  readonly initials: string;
}

/**
 * Who is signed in, for the profile button of the staff shell. The name comes from the account (`GET /me`); a doctor's
 * specialty from the public catalog, found by the `PractitionerRole` the token names (the catalog lists the roles of each
 * doctor). Both reads are cached and both degrade to the role word, so the shell never waits for them.
 */
export function useStaffProfile(): StaffProfile {
  const t = useT('layout');
  const role = useSessionStore((state) => state.role);
  const fhirUser = useSessionStore((state) => state.fhirUser);
  const prefix: 'doctor' | 'admin' = role === 'DOCTOR' ? 'doctor' : 'admin';
  const account = useAccount();
  const roleId: string | null = role === 'DOCTOR' ? roleIdOf(fhirUser) : null;
  const doctors = useDoctors({}, roleId !== null);
  const specialty: string | undefined =
    roleId === null ? undefined : doctors.data?.items.find((doctor) => doctor.practitionerRoleIds?.includes(roleId) === true)?.specialty;
  const accountName: string = account.data === undefined ? '' : (account.data.name ?? doctorLabel({ lastName: account.data.lastName, firstName: account.data.firstName, name: '' }));
  const name: string = accountName === '' ? t(`${prefix}.user`) : accountName;
  return { name, subtitle: specialty ?? t(`${prefix}.user`), initials: accountName === '' ? '' : initialsOf(accountName) };
}
