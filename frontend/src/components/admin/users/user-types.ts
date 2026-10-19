import type { UserRole } from '@/lib/auth/user-role';

export type { UserRole };

export const USER_ROLES: ReadonlyArray<UserRole> = ['PATIENT', 'DOCTOR', 'ADMIN'];

/** `UserResponseDto` of `GET /api/v1/admin/users` (api-designer-spec §2.2, plus the additive `name`/`role`/`practitionerRoleRef`). */
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
  /** A FHIR id links the account to a `PractitionerRole`; `null` releases the link. */
  readonly practitionerRoleId?: string | null;
}

/** The bare id of a FHIR reference: `PractitionerRole/abc` → `abc`. */
export function referenceId(reference: string | null): string {
  return reference === null ? '' : (reference.split('/').pop() ?? '');
}
