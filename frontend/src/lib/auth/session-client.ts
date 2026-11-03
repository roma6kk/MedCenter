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
import { clearAllDrafts } from '@/lib/encounter-draft';
import { SESSION_ENDED_REASON } from './authorize-href';
import { setAccessToken, clearAccessToken, getAccessToken } from './access-token';
import { parseUserRole } from './user-role';
import { setFlash } from '@/lib/ui/flash-message';
import { useBookingDraftStore } from '@/store/use-booking-draft-store';
import { useSessionStore } from '@/store/use-session-store';

interface SessionResponse {
  readonly accessToken?: string | null;
  readonly expiresAt?: string | null;
  readonly role?: string | null;
  readonly scope?: string | null;
  readonly patientRef?: string | null;
  readonly fhirUser?: string | null;
}

/**
 * How an exchange with the broker ended. `ok`: there is a session (or nothing changed). `ended`: the server says there is
 * none any more (401, an anonymous answer) and this tab signs out. `unavailable`: the broker could not ask auth-service
 * (503, a rate limit, a dropped connection) — the refresh cookie was not judged, so the tab keeps what it has and the
 * caller may try again; a restart of auth-service must not read as "you were signed out".
 */
export type ExchangeOutcome = 'ok' | 'ended' | 'unavailable';

let exchangeInFlight: Promise<ExchangeOutcome> | null = null;

function signOutLocally(): void {
  clearAccessToken();
  useSessionStore.getState().clearSession();
}

function applySession(data: SessionResponse): ExchangeOutcome {
  if (data.accessToken === undefined) return 'ok';
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
  return token === null ? 'ended' : 'ok';
}

/** 429 and the 5xx family (the broker's own 503 above all) say "ask again later", not "this token is no good". */
function isTemporaryFailure(status: number): boolean {
  return status === 429 || status >= 500;
}

function markUnavailable(): ExchangeOutcome {
  useSessionStore.getState().markUnavailable();
  return 'unavailable';
}

async function runExchange(url: string, init: RequestInit): Promise<ExchangeOutcome> {
  try {
    const response: Response = await fetch(url, { ...init, credentials: 'same-origin' });
    if (isTemporaryFailure(response.status)) return markUnavailable();
    if (!response.ok) {
      signOutLocally();
      return 'ended';
    }
    return applySession((await response.json()) as SessionResponse);
  } catch (error: unknown) {
    console.error(`[session] ${url} failed`, error);
    return markUnavailable();
  }
}

function exchange(url: string, init: RequestInit): Promise<ExchangeOutcome> {
  if (exchangeInFlight !== null) return exchangeInFlight;
  const attempt: Promise<ExchangeOutcome> = runExchange(url, init).finally(() => {
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

/** Silent refresh (`POST /api/auth/refresh`): `ok` when renewed, `ended` when the session is gone, `unavailable` when auth-service did not answer. */
export function refreshSession(): Promise<ExchangeOutcome> {
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

/** User-initiated sign-out: ends the session and returns to the home page with a clean in-memory state (`/login` now leads straight into the sign-in form, which is no place to land after signing out). */
export async function logout(): Promise<void> {
  await endSession();
  // The booking draft carries the visit reason (health data) in this tab's sessionStorage: it must not outlive a sign-out.
  useBookingDraftStore.getState().clearDraft();
  // Likewise the unfinished encounter forms kept for the doctor in this browser (clinical text, A8).
  clearAllDrafts();
  window.location.assign('/');
}

/** The session died on the server (revoked token): leave a toast for the login page and go there with `returnTo`. */
export async function endRevokedSession(): Promise<void> {
  await endSession();
  setFlash('session-ended');
  const returnTo: string = window.location.pathname + window.location.search;
  window.location.assign(`/login?returnTo=${encodeURIComponent(returnTo)}&reason=${SESSION_ENDED_REASON}`);
}

/** The session can not be renewed: go to login and come back to the current page afterwards. */
export function redirectToLogin(): void {
  const returnTo: string = window.location.pathname + window.location.search;
  window.location.assign(`/login?returnTo=${encodeURIComponent(returnTo)}`);
}
