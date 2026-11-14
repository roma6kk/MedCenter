// Refresh tokens are single-use: every exchange in this tab goes through ONE in-flight request.
import { clearAllDrafts } from '@/lib/encounter-draft';
import { SESSION_ENDED_REASON, SESSION_IDLE_REASON } from './authorize-href';
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

export type ExchangeOutcome = 'ok' | 'ended' | 'unavailable';

let exchangeInFlight: Promise<ExchangeOutcome> | null = null;

function signOutLocally(): void {
  clearAccessToken();
  useSessionStore.getState().clearSession();
}

function applySession(data: SessionResponse): ExchangeOutcome {
  if (data.accessToken === undefined) return 'ok';
  const token = typeof data.accessToken === 'string' ? data.accessToken : null;
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

function markUnavailable(): ExchangeOutcome {
  useSessionStore.getState().markUnavailable();
  return 'unavailable';
}

async function runExchange(url: string, init: RequestInit): Promise<ExchangeOutcome> {
  try {
    const response = await fetch(url, { ...init, credentials: 'same-origin' });
    if (response.status === 429 || response.status >= 500) return markUnavailable();
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
  const attempt = runExchange(url, init).finally(() => {
    exchangeInFlight = null;
  });
  exchangeInFlight = attempt;
  return attempt;
}

export async function loadSession(): Promise<void> {
  await exchange('/api/auth/session', {});
}

const SESSION_REUSE_MARGIN_MS = 60_000;

export async function ensureSession(now: number = Date.now()): Promise<void> {
  const { hydrated, accessToken, expiresAt } = useSessionStore.getState();
  const isLive = accessToken !== null && expiresAt !== null && Date.parse(expiresAt) - now > SESSION_REUSE_MARGIN_MS;
  if (hydrated && isLive) return;
  await loadSession();
}

export function refreshSession(): Promise<ExchangeOutcome> {
  return exchange('/api/auth/refresh', { method: 'POST' });
}

export async function endSession(reason?: 'idle'): Promise<void> {
  const token = getAccessToken();
  const headers: Record<string, string> = token === null ? {} : { Authorization: `Bearer ${token}` };
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: reason === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
      ...(reason !== undefined ? { body: JSON.stringify({ reason }) } : {}),
    });
  } catch (error: unknown) {
    console.error('[session] logout request failed; the local session is cleared anyway', error);
  } finally {
    signOutLocally();
  }
}

export async function logout(): Promise<void> {
  await endSession();
  // The booking draft (visit reason) and the encounter drafts (clinical text) must not outlive a sign-out.
  useBookingDraftStore.getState().clearDraft();
  clearAllDrafts();
  window.location.assign('/');
}

export function currentReturnTo(): string {
  return window.location.pathname + window.location.search;
}

export async function endRevokedSession(): Promise<void> {
  await endSession();
  setFlash('session-ended');
  window.location.assign(`/login?returnTo=${encodeURIComponent(currentReturnTo())}&reason=${SESSION_ENDED_REASON}`);
}

// Same clean-up as a manual logout: an unattended screen must not leave booking or clinical drafts behind.
export async function endIdleSession(): Promise<void> {
  const returnTo = currentReturnTo();
  await endSession('idle');
  useBookingDraftStore.getState().clearDraft();
  clearAllDrafts();
  setFlash('session-idle');
  window.location.assign(`/login?returnTo=${encodeURIComponent(returnTo)}&reason=${SESSION_IDLE_REASON}`);
}

// The server already revoked the session; the logout request below only clears the cookies. Nothing of the closed account may stay in this browser.
export async function endClosedAccountSession(): Promise<void> {
  await endSession();
  useBookingDraftStore.getState().clearDraft();
  clearAllDrafts();
  window.location.assign('/account-closed');
}

export function redirectToLogin(): void {
  window.location.assign(`/login?returnTo=${encodeURIComponent(currentReturnTo())}`);
}
