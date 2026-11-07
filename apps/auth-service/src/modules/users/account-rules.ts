import { Role } from '@medcenter/contracts';

import { invalidUserInput, selfLockout } from './user-errors';
import type { UserRecord } from './store/user-store';

interface AccountShape {
  readonly roles: ReadonlyArray<Role>;
  readonly birthDate?: string;
  readonly practitionerRoleId?: string;
}

export function assertCreatable(shape: AccountShape): void {
  if (shape.roles.includes(Role.PATIENT) && shape.birthDate === undefined) {
    throw invalidUserInput('birthDate: required for a PATIENT account');
  }
  assertPractitionerRoleFits(shape.roles, shape.practitionerRoleId);
}

function assertPractitionerRoleFits(roles: ReadonlyArray<Role>, practitionerRoleId: string | null | undefined): void {
  if (typeof practitionerRoleId === 'string' && !roles.includes(Role.DOCTOR)) {
    throw invalidUserInput('practitionerRoleId: only valid for a DOCTOR account');
  }
}

interface AccountUpdate {
  readonly roles?: ReadonlyArray<Role>;
  readonly isActive?: boolean;
  readonly practitionerRoleId?: string | null;
}

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
