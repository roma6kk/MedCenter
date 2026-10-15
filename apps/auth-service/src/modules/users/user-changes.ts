import { Role } from '@medcenter/contracts';

import { normaliseEmail } from '../../config/auth-env';
import type { PatientDemographicsChange } from './patient-provisioner';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { UserChanges, UserRecord } from './store/user-store';

/**
 * A `PractitionerRole` identifies a DOCTOR only: an explicit value wins (`null`
 * releases the link), and dropping the DOCTOR role releases the one the
 * account still holds, so the role can be given to its next doctor.
 */
function practitionerRoleChange(dto: UpdateUserDto, current: UserRecord): string | null | undefined {
  if (dto.practitionerRoleId !== undefined) {
    return dto.practitionerRoleId;
  }
  const dropsDoctor = dto.roles !== undefined && !dto.roles.includes(Role.DOCTOR);
  return dropsDoctor && current.links.practitionerRoleId !== undefined ? null : undefined;
}

/** What a PATCH changes in the `auth` schema; applied by the store in one transaction. */
export function changesOf(dto: UpdateUserDto, current: UserRecord): UserChanges {
  const practitionerRoleId = practitionerRoleChange(dto, current);
  return {
    ...(dto.email !== undefined ? { email: normaliseEmail(dto.email) } : {}),
    ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
    ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
    ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    ...(dto.roles !== undefined ? { roles: [...new Set(dto.roles)] } : {}),
    ...(practitionerRoleId !== undefined ? { practitionerRoleId } : {}),
  };
}

/** What a PATCH changes in the linked FHIR `Patient`; `null` when it touches nothing the Patient holds. */
export function demographicsOf(dto: UpdateUserDto): PatientDemographicsChange | null {
  const change: PatientDemographicsChange = {
    ...(dto.email !== undefined ? { email: normaliseEmail(dto.email) } : {}),
    ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
    ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
    ...(dto.birthDate !== undefined ? { birthDate: dto.birthDate } : {}),
    ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
  };
  return Object.keys(change).length === 0 ? null : change;
}

/** The changes that put exactly the fields of `changes` back to their values in `before`. */
export function inverseOf(before: UserRecord, changes: UserChanges): UserChanges {
  return {
    ...(changes.email !== undefined ? { email: before.email } : {}),
    ...(changes.firstName !== undefined ? { firstName: before.firstName } : {}),
    ...(changes.lastName !== undefined ? { lastName: before.lastName } : {}),
    ...(changes.isActive !== undefined ? { isActive: before.isActive } : {}),
    ...(changes.roles !== undefined ? { roles: before.roles } : {}),
    ...(changes.practitionerRoleId !== undefined ? { practitionerRoleId: before.links.practitionerRoleId ?? null } : {}),
  };
}
