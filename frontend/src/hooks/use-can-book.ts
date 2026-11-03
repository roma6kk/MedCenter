'use client';

import { useSessionStore } from '@/store/use-session-store';

/**
 * Whether this visitor is offered a booking: a guest and a patient are, a doctor and an administrator are not. Choosing a
 * slot and booking are patient functions (FR-003, FR-004), and the booking route would only answer staff with a 403, so
 * every «Записаться» of the public pages asks this one place instead of repeating the role check.
 */
export function useCanBook(): boolean {
  return useSessionStore((state) => state.role !== 'DOCTOR' && state.role !== 'ADMIN');
}
