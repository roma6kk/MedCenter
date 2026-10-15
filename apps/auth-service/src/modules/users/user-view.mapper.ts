import { primaryRole } from '../oauth/identity';
import type { ExternalLinkDto, UserDetailsResponseDto, UserResponseDto } from './dto/user-response.dto';
import type { UserRecord } from './store/user-store';

function externalLinksOf(user: UserRecord): ExternalLinkDto[] {
  const links: ExternalLinkDto[] = [];
  if (user.links.patientId !== undefined) {
    const resourceId = user.links.patientId;
    links.push({ resourceType: 'Patient', resourceId, reference: `Patient/${resourceId}` });
  }
  if (user.links.practitionerRoleId !== undefined) {
    const resourceId = user.links.practitionerRoleId;
    links.push({ resourceType: 'PractitionerRole', resourceId, reference: `PractitionerRole/${resourceId}` });
  }
  return links;
}

/** Never exposes `passwordHash`: the response is built field by field, not spread from the record. */
export function toUserResponse(user: UserRecord): UserResponseDto {
  const { patientId, practitionerRoleId } = user.links;
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    roles: [...user.roles],
    patientRef: patientId === undefined ? null : `Patient/${patientId}`,
    practitionerRoleRef: practitionerRoleId === undefined ? null : `PractitionerRole/${practitionerRoleId}`,
    isActive: user.isActive,
    name: `${user.lastName} ${user.firstName}`,
    role: primaryRole(user.roles),
  };
}

export function toUserDetails(user: UserRecord): UserDetailsResponseDto {
  return { ...toUserResponse(user), externalLinks: externalLinksOf(user), createdAt: user.createdAt.toISOString() };
}
