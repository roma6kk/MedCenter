import type { Role } from '@medcenter/contracts';

export interface UserResponseDto {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly roles: ReadonlyArray<Role>;
  readonly patientRef: string | null;
  readonly practitionerRoleRef: string | null;
  readonly isActive: boolean;
  readonly name: string;
  readonly role: Role | null;
}

export interface ExternalLinkDto {
  readonly resourceType: 'Patient' | 'PractitionerRole';
  readonly resourceId: string;
  readonly reference: string;
}

export interface UserDetailsResponseDto extends UserResponseDto {
  readonly externalLinks: ReadonlyArray<ExternalLinkDto>;
  readonly createdAt: string;
}
