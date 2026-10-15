import type { UserLinks } from './store/user-store';

/** Relative FHIR references of an account's links, as the audit trail names the resources it touches. */
export function linkedRefs(links: UserLinks): string[] {
  return [
    ...(links.patientId !== undefined ? [`Patient/${links.patientId}`] : []),
    ...(links.practitionerRoleId !== undefined ? [`PractitionerRole/${links.practitionerRoleId}`] : []),
  ];
}
