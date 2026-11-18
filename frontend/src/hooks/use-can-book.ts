'use client';

import { useSessionStore } from '@/store/use-session-store';

export function useCanBook(): boolean {
  return useSessionStore((state) => state.role !== 'DOCTOR' && state.role !== 'ADMIN');
}
