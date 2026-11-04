'use client';

import { roleIdOf } from '@/lib/practitioner-role-id';
import { useSessionStore } from '@/store/use-session-store';
import type { HistoryItem } from './doctor-types';

/** The `PractitionerRole` id of the signed-in doctor; `null` when the session does not name one. */
export function useOwnRoleId(): string | null {
  return roleIdOf(useSessionStore((state) => state.fhirUser));
}

/**
 * Whether the doctor may open the encounter of a history item. The history lists the visits of every doctor the patient has
 * seen with this one, but a record is open to the doctor who held it only; with no own role known the link stays.
 */
export function isOwnVisit(item: HistoryItem, ownRoleId: string | null): boolean {
  return ownRoleId === null || item.practitionerRoleId === ownRoleId;
}
