import { Role } from '@medcenter/contracts';

import type { CreateUserDto } from '../dto/create-user.dto';
import type { UsersHarness } from './users-harness';

/** The administrator that performs every admin call of the users suites. */
export const ADMIN = { sub: 'admin-1', requestId: 'req-1' } as const;

export function doctorDto(overrides: Partial<CreateUserDto> = {}): CreateUserDto {
  return {
    email: 'petrov@example.by',
    firstName: 'Пётр',
    lastName: 'Петров',
    password: 'Str0ng!Pass',
    roles: [Role.DOCTOR],
    ...overrides,
  };
}

export async function seedPatient(harness: UsersHarness, email = 'ivanov@example.by'): Promise<string> {
  const user = await harness.registration.registerPatient({
    email,
    firstName: 'Иван',
    lastName: 'Иванов',
    password: 'Str0ng!Pass',
    birthDate: '1990-05-12',
    accountConsent: { accepted: true, textVersion: '2026-10' },
  });
  return user.id;
}
