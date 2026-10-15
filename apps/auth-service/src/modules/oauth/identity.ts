import { Role, SMART_SCOPES } from '@medcenter/contracts';

/**
 * The principal a token is minted for, resolved from the `auth` schema on
 * every grant (authorization_code **and** refresh_token), so a role change, a
 * new `ExternalLink` or a deactivation takes effect at the next refresh.
 */
export interface Identity {
  readonly userId: string;
  readonly role: Role;
  /** Bare FHIR `Patient` id from `ExternalLink` (resource_type `Patient`). */
  readonly patientId?: string;
  /** Bare FHIR `PractitionerRole` id from `ExternalLink` (resource_type `PractitionerRole`). */
  readonly practitionerRoleId?: string;
}

export interface IdentityResolver {
  /** `null` when the user does not exist, is deactivated or holds no role — no token may be minted. */
  resolve(userId: string): Promise<Identity | null>;
}

export const IDENTITY_RESOLVER = 'IDENTITY_RESOLVER';

/**
 * Identity claims of the cross-service contract:
 * - `patient` — the bare Patient id (SMART launch context), PATIENT only;
 * - `fhirUser` — `Patient/{id}` for PATIENT, `PractitionerRole/{id}` for DOCTOR,
 *   absent for ADMIN. Services fail closed when it is absent.
 */
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

/** Scope matrix of API §0: a role can never be granted another role's SMART scopes. */
const ROLE_SCOPES: Readonly<Record<Role, ReadonlyArray<string>>> = {
  [Role.PATIENT]: [SMART_SCOPES.LAUNCH, SMART_SCOPES.PATIENT_READ, SMART_SCOPES.PATIENT_WRITE],
  [Role.DOCTOR]: [SMART_SCOPES.LAUNCH, SMART_SCOPES.USER_READ, SMART_SCOPES.USER_WRITE],
  [Role.ADMIN]: [SMART_SCOPES.LAUNCH, SMART_SCOPES.USER_READ, SMART_SCOPES.USER_WRITE],
};

/**
 * Narrows a space-separated scope string to what `role` may hold. Returns `''`
 * when nothing survives — callers turn that into `invalid_scope`/`invalid_grant`
 * rather than minting an empty-scope token.
 */
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

/** ADMIN > DOCTOR > PATIENT: the token carries exactly one `role` claim. */
const ROLE_PRECEDENCE: ReadonlyArray<Role> = [Role.ADMIN, Role.DOCTOR, Role.PATIENT];

export function primaryRole(roles: ReadonlyArray<Role>): Role | null {
  return ROLE_PRECEDENCE.find((role) => roles.includes(role)) ?? null;
}
