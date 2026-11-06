// Refresh tokens are single-use: every exchange in this tab goes through ONE in-flight request.
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

export async function loadSession(): Promise<void> {
  await exchange('/api/auth/session', {});
}

const SESSION_REUSE_MARGIN_MS = 60_000;

export async function ensureSession(now: number = Date.now()): Promise<void> {
  const { hydrated, accessToken, expiresAt } = useSessionStore.getState();
  const isLive: boolean = accessToken !== null && expiresAt !== null && Date.parse(expiresAt) - now > SESSION_REUSE_MARGIN_MS;
  if (hydrated && isLive) return;
  await loadSession();
}

export function refreshSession(): Promise<ExchangeOutcome> {
  return exchange('/api/auth/refresh', { method: 'POST' });
}

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

export function redirectToLogin(): void {
  window.location.assign(`/login?returnTo=${encodeURIComponent(currentReturnTo())}`);
}
