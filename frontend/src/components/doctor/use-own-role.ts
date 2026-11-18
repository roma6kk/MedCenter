'use client';

import { roleIdOf } from '@/lib/practitioner-role-id';
import { useSessionStore } from '@/store/use-session-store';
import type { HistoryItem } from './doctor-types';

export function useOwnRoleId(): string | null {
  return roleIdOf(useSessionStore((state) => state.fhirUser));
}

export function isOwnVisit(item: Pick<HistoryItem, 'practitionerRoleId'>, ownRoleId: string | null): boolean {
  return ownRoleId === null || item.practitionerRoleId === ownRoleId;
}
