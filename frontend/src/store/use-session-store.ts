import { create } from 'zustand';

export type UserRole = 'PATIENT' | 'DOCTOR' | 'ADMIN';

export interface SessionState {
  readonly accessToken: string | null;
  readonly expiresAt: string | null;
  readonly role: UserRole | null;
  readonly scope: string | null;
  readonly patientRef: string | null;
  readonly fhirUser: string | null;
  readonly hydrated: boolean;
  setSession: (session: Omit<SessionState, 'hydrated' | 'setSession' | 'clearSession' | 'markHydrated'>) => void;
  clearSession: () => void;
  markHydrated: () => void;
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
  setSession: (session) => set({ ...session, hydrated: true }),
  clearSession: () => set({ ...EMPTY, hydrated: true }),
  markHydrated: () => set({ hydrated: true }),
}));
