/**
 * session-client — the browser side of the token broker.
 *
 * The broker (`/api/auth/session`, `/api/auth/refresh`) reads the httpOnly `mc_rt` refresh cookie, rotates it and
 * returns a short-lived access token plus the derived claims. The access token lives in memory only (never in Web
 * Storage); the user-facing session is mirrored into the Zustand store.
 *
 * Refresh tokens are single-use, so every exchange in this tab goes through ONE in-flight request: a mount-time
 * `loadSession`, a React StrictMode double effect and a 401-triggered refresh share a result instead of racing.
 */
import { setAccessToken, clearAccessToken, getAccessToken } from './access-token';
import { parseUserRole } from './user-role';
import { setFlash } from '@/lib/ui/flash-message';
import { useSessionStore } from '@/store/use-session-store';

interface SessionResponse {
  readonly accessToken?: string | null;
  readonly expiresAt?: string | null;
  readonly role?: string | null;
  readonly scope?: string | null;
  readonly patientRef?: string | null;
  readonly fhirUser?: string | null;
}

let exchangeInFlight: Promise<boolean> | null = null;

function signOutLocally(): void {
  clearAccessToken();
  useSessionStore.getState().clearSession();
}

function applySession(data: SessionResponse): void {
  if (data.accessToken === undefined) return;
  const token: string | null = typeof data.accessToken === 'string' ? data.accessToken : null;
  setAccessToken(token);
  useSessionStore.getState().setSession({
    accessToken: token,
    expiresAt: data.expiresAt ?? null,
    role: parseUserRole(data.role),
    scope: data.scope ?? null,
    patientRef: data.patientRef ?? null,
    fhirUser: data.fhirUser ?? null,
  });
}

async function runExchange(url: string, init: RequestInit): Promise<boolean> {
  try {
    const response: Response = await fetch(url, { ...init, credentials: 'same-origin' });
    if (!response.ok) {
      signOutLocally();
      return false;
    }
    applySession((await response.json()) as SessionResponse);
    return true;
  } catch (error: unknown) {
    console.error(`[session] ${url} failed`, error);
    signOutLocally();
    return false;
  }
}

function exchange(url: string, init: RequestInit): Promise<boolean> {
  if (exchangeInFlight !== null) return exchangeInFlight;
  const attempt: Promise<boolean> = runExchange(url, init).finally(() => {
    exchangeInFlight = null;
  });
  exchangeInFlight = attempt;
  return attempt;
}

/** Hydrates the store from `GET /api/auth/session`; an anonymous visitor ends up hydrated with no role. */
export async function loadSession(): Promise<void> {
  await exchange('/api/auth/session', {});
}

const SESSION_REUSE_MARGIN_MS = 60_000;

/**
 * Hydrates the store once per page load: a second route group mounting its own `Providers` reuses the live session
 * instead of rotating the refresh token again. An expired or missing token is exchanged.
 */
export async function ensureSession(now: number = Date.now()): Promise<void> {
  const { hydrated, accessToken, expiresAt } = useSessionStore.getState();
  const isLive: boolean = accessToken !== null && expiresAt !== null && Date.parse(expiresAt) - now > SESSION_REUSE_MARGIN_MS;
  if (hydrated && isLive) return;
  await loadSession();
}

/** Silent refresh (`POST /api/auth/refresh`). Resolves `false` when the session cannot be renewed. */
export function refreshSession(): Promise<boolean> {
  return exchange('/api/auth/refresh', { method: 'POST' });
}

/** Revokes the refresh token server-side and forgets the session in this tab. Never throws. */
export async function endSession(): Promise<void> {
  const token: string | null = getAccessToken();
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: token === null ? {} : { Authorization: `Bearer ${token}` },
    });
  } catch (error: unknown) {
    console.error('[session] logout request failed; the local session is cleared anyway', error);
  } finally {
    signOutLocally();
  }
}

/** User-initiated sign-out: ends the session and returns to the login screen with a clean in-memory state. */
export async function logout(): Promise<void> {
  await endSession();
  window.location.assign('/login');
}

/** The session died on the server (revoked token): leave a toast for the login page and go there with `returnTo`. */
export async function endRevokedSession(): Promise<void> {
  await endSession();
  setFlash('session-ended');
  const returnTo: string = window.location.pathname + window.location.search;
  window.location.assign(`/login?returnTo=${encodeURIComponent(returnTo)}`);
}

/** The session can not be renewed: go to login and come back to the current page afterwards. */
export function redirectToLogin(): void {
  const returnTo: string = window.location.pathname + window.location.search;
  window.location.assign(`/login?returnTo=${encodeURIComponent(returnTo)}`);
}
