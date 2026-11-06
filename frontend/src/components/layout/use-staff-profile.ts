'use client';

import { useDoctors } from '@/components/catalog/use-catalog';
import { initialsOf } from '@/components/doctor/journal-model';
import { useAccount } from '@/components/patient/use-patient-queries';
import { doctorLabel } from '@/lib/doctor-name';
import { useT } from '@/lib/i18n/use-t';
import { roleIdOf } from '@/lib/practitioner-role-id';
import { useSessionStore } from '@/store/use-session-store';

export interface StaffProfile {
  readonly name: string;
  readonly subtitle: string;
  readonly initials: string;
}

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
