import { Role, SMART_SCOPES } from '@medcenter/contracts';

export interface Identity {
  readonly userId: string;
  readonly role: Role;
  readonly patientId?: string;
  readonly practitionerRoleId?: string;
}

export interface IdentityResolver {
  resolve(userId: string): Promise<Identity | null>;
}

export const IDENTITY_RESOLVER = 'IDENTITY_RESOLVER';

export interface IdentityClaims {
  readonly role: Role;
  readonly patient?: string;
  readonly fhirUser?: string;
}

export function toIdentityClaims(identity: Identity): IdentityClaims {
  if (identity.role === Role.PATIENT && identity.patientId !== undefined) {
    return { role: identity.role, patient: identity.patientId, fhirUser: `Patient/${identity.patientId}` };
  }
  if (identity.role === Role.DOCTOR && identity.practitionerRoleId !== undefined) {
    return { role: identity.role, fhirUser: `PractitionerRole/${identity.practitionerRoleId}` };
  }
  return { role: identity.role };
}

const ROLE_SCOPES: Readonly<Record<Role, ReadonlyArray<string>>> = {
  [Role.PATIENT]: [SMART_SCOPES.LAUNCH, SMART_SCOPES.PATIENT_READ, SMART_SCOPES.PATIENT_WRITE],
  [Role.DOCTOR]: [SMART_SCOPES.LAUNCH, SMART_SCOPES.USER_READ, SMART_SCOPES.USER_WRITE],
  [Role.ADMIN]: [SMART_SCOPES.LAUNCH, SMART_SCOPES.USER_READ, SMART_SCOPES.USER_WRITE],
};

export function restrictScopeToRole(scope: string, role: Role): string {
  const allowed = ROLE_SCOPES[role];
  return scope
    .split(' ')
    .filter((item) => item.length > 0 && allowed.includes(item))
    .join(' ');
}

export function isRole(value: unknown): value is Role {
  return value === Role.PATIENT || value === Role.DOCTOR || value === Role.ADMIN;
}

const ROLE_PRECEDENCE: ReadonlyArray<Role> = [Role.ADMIN, Role.DOCTOR, Role.PATIENT];

export function primaryRole(roles: ReadonlyArray<Role>): Role | null {
  return ROLE_PRECEDENCE.find((role) => roles.includes(role)) ?? null;
}
