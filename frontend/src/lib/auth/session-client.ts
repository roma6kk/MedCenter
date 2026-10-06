/**
 * session-client — hydrates the browser session from the token broker.
 *
 * The broker (`/api/auth/session`) reads the httpOnly `mc_rt` refresh cookie,
 * exchanges it for a short-lived access token, and returns the derived claims.
 * The access token is stored in memory (never in Web Storage) and the
 * user-facing session state is mirrored into the Zustand store.
 */

import { setAccessToken, clearAccessToken } from './access-token';
import { useSessionStore, type UserRole } from '@/store/use-session-store';

interface SessionResponse {
  readonly accessToken?: string | null;
  readonly expiresAt?: string | null;
  readonly role?: string | null;
  readonly scope?: string | null;
  readonly patientRef?: string | null;
  readonly fhirUser?: string | null;
}

function asRole(value: string | null | undefined): UserRole | null {
  return value === 'PATIENT' || value === 'DOCTOR' || value === 'ADMIN' ? value : null;
}

export async function loadSession(): Promise<void> {
  try {
    const res: Response = await fetch('/api/auth/session', { credentials: 'same-origin' });
    if (!res.ok) {
      clearAccessToken();
      useSessionStore.getState().markHydrated();
      return;
    }
    const data: SessionResponse = (await res.json()) as SessionResponse;
    const token: string | null = typeof data.accessToken === 'string' ? data.accessToken : null;
    setAccessToken(token);
    useSessionStore.getState().setSession({
      accessToken: token,
      expiresAt: data.expiresAt ?? null,
      role: asRole(data.role),
      scope: data.scope ?? null,
      patientRef: data.patientRef ?? null,
      fhirUser: data.fhirUser ?? null,
    });
  } catch {
    clearAccessToken();
    useSessionStore.getState().markHydrated();
  }
}
