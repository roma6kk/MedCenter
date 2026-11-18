import type { UserLinks } from './store/user-store';

export function linkedRefs(links: UserLinks): string[] {
  return [
    ...(links.patientId !== undefined ? [`Patient/${links.patientId}`] : []),
    ...(links.practitionerRoleId !== undefined ? [`PractitionerRole/${links.practitionerRoleId}`] : []),
  ];
}
