import { Role } from '@medcenter/contracts';

import { normaliseEmail } from '../../config/auth-env';
import type { PatientDemographicsChange } from './patient-provisioner';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { UserChanges, UserRecord } from './store/user-store';

function practitionerRoleChange(dto: UpdateUserDto, current: UserRecord): string | null | undefined {
  if (dto.practitionerRoleId !== undefined) {
    return dto.practitionerRoleId;
  }
  const dropsDoctor = dto.roles !== undefined && !dto.roles.includes(Role.DOCTOR);
  return dropsDoctor && current.links.practitionerRoleId !== undefined ? null : undefined;
}

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

const sameSet = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean =>
  a.length === b.length && a.every((value) => b.includes(value));

export function effectiveChangesOf(changes: UserChanges, current: UserRecord): UserChanges {
  return {
    ...(changes.email !== undefined && changes.email !== current.email ? { email: changes.email } : {}),
    ...(changes.firstName !== undefined && changes.firstName !== current.firstName ? { firstName: changes.firstName } : {}),
    ...(changes.lastName !== undefined && changes.lastName !== current.lastName ? { lastName: changes.lastName } : {}),
    ...(changes.isActive !== undefined && changes.isActive !== current.isActive ? { isActive: changes.isActive } : {}),
    ...(changes.roles !== undefined && !sameSet(changes.roles, current.roles) ? { roles: changes.roles } : {}),
    ...(changes.practitionerRoleId !== undefined && changes.practitionerRoleId !== (current.links.practitionerRoleId ?? null)
      ? { practitionerRoleId: changes.practitionerRoleId }
      : {}),
  };
}

export function effectiveDemographicsOf(change: PatientDemographicsChange | null, current: UserRecord): PatientDemographicsChange | null {
  if (change === null) {
    return null;
  }
  const effective: PatientDemographicsChange = {
    ...(change.email !== undefined && change.email !== current.email ? { email: change.email } : {}),
    ...(change.firstName !== undefined && change.firstName !== current.firstName ? { firstName: change.firstName } : {}),
    ...(change.lastName !== undefined && change.lastName !== current.lastName ? { lastName: change.lastName } : {}),
    ...(change.birthDate !== undefined ? { birthDate: change.birthDate } : {}),
    ...(change.gender !== undefined ? { gender: change.gender } : {}),
  };
  return Object.keys(effective).length === 0 ? null : effective;
}

export function inverseOf(before: UserRecord, changes: UserChanges): UserChanges {
  return {
    ...(changes.email !== undefined ? { email: before.email } : {}),
    ...(changes.firstName !== undefined ? { firstName: before.firstName } : {}),
    ...(changes.lastName !== undefined ? { lastName: before.lastName } : {}),
    ...(changes.isActive !== undefined ? { isActive: before.isActive } : {}),
    ...(changes.closedAt !== undefined ? { closedAt: before.closedAt ?? null } : {}),
    ...(changes.retentionUntil !== undefined ? { retentionUntil: before.retentionUntil ?? null } : {}),
    ...(changes.roles !== undefined ? { roles: before.roles } : {}),
    ...(changes.practitionerRoleId !== undefined ? { practitionerRoleId: before.links.practitionerRoleId ?? null } : {}),
  };
}
