import type { Role } from '@medcenter/contracts';

import { PATIENT_PASSWORD } from './auth-flow-helpers';

export const AUTH_USER_SYSTEM = 'https://api.medcenter.by/sid/auth-user';
export const STAFF_PASSWORD = 'D0ctor!Passw0rd';

export const REGISTRATION = {
  firstName: 'Анна',
  lastName: 'Орлова',
  password: PATIENT_PASSWORD,
  birthDate: '1991-03-04',
  accountConsent: { accepted: true, textVersion: '2026-10' },
  gender: 'female',
} as const;

export function staffBody(
  email: string,
  roles: ReadonlyArray<Role>,
  extra: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    email,
    firstName: 'Пётр',
    lastName: 'Петров',
    password: STAFF_PASSWORD,
    roles,
    ...extra,
  };
}

export function storedPatient(id: string, userId: string): Record<string, unknown> {
  return {
    resourceType: 'Patient',
    id,
    meta: { versionId: '7' },
    active: true,
    identifier: [{ system: AUTH_USER_SYSTEM, value: userId }],
    name: [
      { use: 'official', family: 'Орлова', given: ['Анна'] },
      { use: 'nickname', given: ['Аня'] },
    ],
    telecom: [
      { system: 'email', value: 'anna@example.by', use: 'home' },
      { system: 'phone', value: '+375291112233', use: 'mobile' },
    ],
    birthDate: '1991-03-04',
    gender: 'female',
  };
}
