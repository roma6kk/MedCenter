import type { UserRole } from '@/lib/auth/user-role';

export type { UserRole };

export const USER_ROLES: ReadonlyArray<UserRole> = ['PATIENT', 'DOCTOR', 'ADMIN'];

export interface AdminUser {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly roles: ReadonlyArray<UserRole>;
  readonly patientRef: string | null;
  readonly practitionerRoleRef: string | null;
  readonly isActive: boolean;
  readonly name: string;
  readonly role: UserRole | null;
  readonly accountConsentWithdrawnAt?: string | null;
}

export interface CreateUserPayload {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly password: string;
  readonly roles: ReadonlyArray<UserRole>;
  readonly birthDate?: string;
  readonly gender?: 'male' | 'female';
  readonly practitionerRoleId?: string;
}

export interface UpdateUserPayload {
  readonly email?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly roles?: ReadonlyArray<UserRole>;
  readonly isActive?: boolean;
  readonly practitionerRoleId?: string | null;
}

export function referenceId(reference: string | null): string {
  return reference === null ? '' : (reference.split('/').pop() ?? '');
}
