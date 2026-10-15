import type { Role } from '@medcenter/contracts';

/**
 * API §2.2.6 `UserResponseDto`: `{ id, email, firstName, lastName, roles,
 * patientRef, isActive }`, plus additive fields — `practitionerRoleRef` (the
 * DOCTOR link) and `name`/`role`, which the admin users table
 * (`frontend/src/components/admin/users-table.tsx`, `UserRow`) renders.
 */
export interface UserResponseDto {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly roles: ReadonlyArray<Role>;
  /** `Patient/{id}` or `null`. */
  readonly patientRef: string | null;
  /** `PractitionerRole/{id}` or `null`. */
  readonly practitionerRoleRef: string | null;
  readonly isActive: boolean;
  /** Display name, `Фамилия Имя`. */
  readonly name: string;
  /** The role a token of this account carries (ADMIN > DOCTOR > PATIENT). */
  readonly role: Role | null;
}

export interface ExternalLinkDto {
  readonly resourceType: 'Patient' | 'PractitionerRole';
  readonly resourceId: string;
  /** Relative FHIR reference, e.g. `Patient/9f2c…`. */
  readonly reference: string;
}

/** API §2.2.3 card: the user plus its `ExternalLink` rows. */
export interface UserDetailsResponseDto extends UserResponseDto {
  readonly externalLinks: ReadonlyArray<ExternalLinkDto>;
  readonly createdAt: string;
}
