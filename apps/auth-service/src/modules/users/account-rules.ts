import { Role } from '@medcenter/contracts';

import { invalidUserInput, selfLockout } from './user-errors';
import type { UserRecord } from './store/user-store';

/** The shape of an account about to be created (self-registration, admin, bootstrap). */
export interface AccountShape {
  readonly roles: ReadonlyArray<Role>;
  readonly birthDate?: string;
  readonly practitionerRoleId?: string;
}

/**
 * A PATIENT account must be provisioned with a FHIR `Patient`, whose R4
 * `birthDate` the clinic requires; a `PractitionerRole` can only identify a
 * DOCTOR (`fhirUser` contract — a PATIENT or ADMIN token must never carry it).
 */
export function assertCreatable(shape: AccountShape): void {
  if (shape.roles.includes(Role.PATIENT) && shape.birthDate === undefined) {
    throw invalidUserInput('birthDate: required for a PATIENT account');
  }
  assertPractitionerRoleFits(shape.roles, shape.practitionerRoleId);
}

function assertPractitionerRoleFits(roles: ReadonlyArray<Role>, practitionerRoleId: string | null | undefined): void {
  // `null` releases a link, which no role set can forbid.
  if (typeof practitionerRoleId === 'string' && !roles.includes(Role.DOCTOR)) {
    throw invalidUserInput('practitionerRoleId: only valid for a DOCTOR account');
  }
}

export interface AccountUpdate {
  readonly roles?: ReadonlyArray<Role>;
  readonly isActive?: boolean;
  readonly practitionerRoleId?: string | null;
}

/**
 * Rules of an admin PATCH:
 * - an administrator cannot lock themselves out (deactivate or drop ADMIN);
 * - PATIENT can only be granted to an account that already has its `Patient`
 *   (otherwise its tokens would carry no compartment and fail closed everywhere);
 * - a `PractitionerRole` link needs the DOCTOR role in the resulting role set.
 */
export function assertUpdatable(current: UserRecord, update: AccountUpdate, actorSub: string): void {
  const isDemotingSelf = update.roles !== undefined && !update.roles.includes(Role.ADMIN);
  if (current.id === actorSub && (update.isActive === false || isDemotingSelf)) {
    throw selfLockout();
  }
  if (update.roles?.includes(Role.PATIENT) === true && current.links.patientId === undefined) {
    throw invalidUserInput('roles: PATIENT requires a linked FHIR Patient (self-registration)');
  }
  assertPractitionerRoleFits(update.roles ?? current.roles, update.practitionerRoleId);
}
