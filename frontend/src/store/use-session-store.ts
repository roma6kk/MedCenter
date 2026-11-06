import { create } from 'zustand';
import type { UserRole } from '@/lib/auth/user-role';

export type { UserRole };

export interface SessionState {
  readonly accessToken: string | null;
  readonly expiresAt: string | null;
  readonly role: UserRole | null;
  readonly scope: string | null;
  readonly patientRef: string | null;
  readonly fhirUser: string | null;
  readonly hydrated: boolean;
  // auth-service did not answer: the refresh cookie may still be valid, so a guard offers a retry instead of the sign-in page.
  readonly unavailable: boolean;
  setSession: (session: Omit<SessionState, 'hydrated' | 'unavailable' | 'setSession' | 'clearSession' | 'markHydrated' | 'markUnavailable'>) => void;
  clearSession: () => void;
  markHydrated: () => void;
  markUnavailable: () => void;
}

const EMPTY = {
  accessToken: null,
  expiresAt: null,
  role: null,
  scope: null,
  patientRef: null,
  fhirUser: null,
} as const;

export const useSessionStore = create<SessionState>()((set) => ({
  ...EMPTY,
  hydrated: false,
  unavailable: false,
  setSession: (session) => set({ ...session, hydrated: true, unavailable: false }),
  clearSession: () => set({ ...EMPTY, hydrated: true, unavailable: false }),
  markHydrated: () => set({ hydrated: true }),
  markUnavailable: () => set((state) => (state.role === null ? { hydrated: true, unavailable: true } : state)),
}));
