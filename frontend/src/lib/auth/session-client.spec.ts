import { currentReturnTo, endClosedAccountSession, endIdleSession, endRevokedSession, endSession, ensureSession, loadSession, logout, redirectToLogin, refreshSession } from './session-client';
import { getAccessToken, clearAccessToken, setAccessToken } from './access-token';
import { readDraft, writeDraft } from '@/lib/encounter-draft';
import { consumeFlash } from '@/lib/ui/flash-message';
import { useBookingDraftStore } from '@/store/use-booking-draft-store';
import { useSessionStore } from '@/store/use-session-store';

function resetStore(): void {
  useSessionStore.setState({
    accessToken: null,
    expiresAt: null,
    role: null,
    scope: null,
    patientRef: null,
    fhirUser: null,
    hydrated: false,
    unavailable: false,
  });
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const LIVE_SESSION = {
  accessToken: 'a.b.c',
  expiresAt: '2026-10-16T10:15:00.000Z',
  role: 'PATIENT',
  scope: 'patient/*.read',
  patientRef: '1439',
  fhirUser: null,
};

beforeEach(() => {
  jest.restoreAllMocks();
  clearAccessToken();
  resetStore();
});

afterEach(() => {
  jest.restoreAllMocks();
  clearAccessToken();
  resetStore();
});

describe('loadSession', () => {
  it('should hydrate the store and the token holder from the broker', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse(
        {
          accessToken: 'a.b.c',
          expiresAt: '2026-10-05T10:00:00.000Z',
          role: 'PATIENT',
          scope: 'patient/*.read',
          patientRef: 'Patient/1',
          fhirUser: 'Patient/1',
        },
        200,
      ),
    );

    await loadSession();

    expect(getAccessToken()).toBe('a.b.c');
    const state = useSessionStore.getState();
    expect(state.role).toBe('PATIENT');
    expect(state.patientRef).toBe('Patient/1');
    expect(state.hydrated).toBe(true);
  });

  it('should mark hydrated and stay signed out when the broker returns no token', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({ accessToken: null }, 200));

    await loadSession();

    expect(getAccessToken()).toBeNull();
    expect(useSessionStore.getState().hydrated).toBe(true);
  });

  it('should coerce an unknown role to null', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({ accessToken: 'a.b.c', role: 'SUPERUSER' }, 200));

    await loadSession();

    expect(useSessionStore.getState().role).toBeNull();
  });

  it('should mark hydrated and flag the session unavailable, not signed out, when the broker is unreachable', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('network down'));

    await loadSession();

    expect(getAccessToken()).toBeNull();
    const state = useSessionStore.getState();
    expect(state.hydrated).toBe(true);
    expect(state.unavailable).toBe(true);
    expect(state.role).toBeNull();
  });

  it.each([500, 503, 429])('should flag the session unavailable on a %i from the broker: auth-service did not judge the refresh cookie', async (status) => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({ error: 'auth_unavailable' }, status));

    await loadSession();

    expect(useSessionStore.getState().hydrated).toBe(true);
    expect(useSessionStore.getState().unavailable).toBe(true);
  });

  it('should keep a session already in memory when the broker answers 503', async () => {
    setAccessToken('a.b.c');
    useSessionStore.getState().setSession({ ...LIVE_SESSION, role: 'DOCTOR' });
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({ error: 'auth_unavailable' }, 503));

    await loadSession();

    expect(getAccessToken()).toBe('a.b.c');
    expect(useSessionStore.getState().role).toBe('DOCTOR');
    expect(useSessionStore.getState().unavailable).toBe(false);
  });

  it('should sign out on a refused broker response', async () => {
    setAccessToken('a.b.c');
    useSessionStore.getState().setSession({ ...LIVE_SESSION, role: 'DOCTOR' });
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(null, { status: 401 }));

    await loadSession();

    expect(getAccessToken()).toBeNull();
    expect(useSessionStore.getState().role).toBeNull();
    expect(useSessionStore.getState().unavailable).toBe(false);
    expect(useSessionStore.getState().hydrated).toBe(true);
  });

  it('should recover once auth-service answers again', async () => {
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ error: 'auth_unavailable' }, 503))
      .mockResolvedValueOnce(jsonResponse(LIVE_SESSION, 200));

    await loadSession();
    expect(useSessionStore.getState().unavailable).toBe(true);
    await loadSession();

    expect(useSessionStore.getState().unavailable).toBe(false);
    expect(useSessionStore.getState().role).toBe('PATIENT');
  });
});

describe('session exchange single flight', () => {
  it('should share one request between a mount-time load and a StrictMode double load', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(LIVE_SESSION, 200));

    await Promise.all([loadSession(), loadSession()]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('should share the in-flight load with a refresh triggered by a 401 so the single-use token is rotated once', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(LIVE_SESSION, 200));

    const [, refreshed] = await Promise.all([loadSession(), refreshSession()]);

    expect(refreshed).toBe('ok');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('should start a new exchange once the previous one has finished', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve(jsonResponse(LIVE_SESSION, 200)));

    await loadSession();
    await loadSession();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe('refreshSession', () => {
  it('should POST to the refresh endpoint and update the token and the store', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse(LIVE_SESSION, 200));

    const refreshed = await refreshSession();

    expect(refreshed).toBe('ok');
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('/api/auth/refresh');
    expect((fetchSpy.mock.calls[0]?.[1] as RequestInit).method).toBe('POST');
    expect(getAccessToken()).toBe('a.b.c');
    expect(useSessionStore.getState().role).toBe('PATIENT');
  });

  it('should keep the current session when a 200 body carries no token field at all', async () => {
    useSessionStore.getState().setSession({ ...LIVE_SESSION, role: 'PATIENT' });
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({ ok: true }, 200));

    await expect(refreshSession()).resolves.toBe('ok');

    expect(useSessionStore.getState().role).toBe('PATIENT');
  });

  it('should sign the tab out and resolve ended when the refresh is refused', async () => {
    useSessionStore.getState().setSession({ ...LIVE_SESSION, role: 'PATIENT' });
    setAccessToken('a.b.c');
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(null, { status: 401 }));

    await expect(refreshSession()).resolves.toBe('ended');

    expect(getAccessToken()).toBeNull();
    expect(useSessionStore.getState().role).toBeNull();
  });

  it('should resolve ended when the broker answers 200 for an anonymous visitor', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({ accessToken: null }, 200));

    await expect(refreshSession()).resolves.toBe('ended');
  });

  it('should resolve unavailable and keep the tab signed in when the broker answers 503', async () => {
    useSessionStore.getState().setSession({ ...LIVE_SESSION, role: 'PATIENT' });
    setAccessToken('a.b.c');
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({ error: 'auth_unavailable' }, 503));

    await expect(refreshSession()).resolves.toBe('unavailable');

    expect(getAccessToken()).toBe('a.b.c');
    expect(useSessionStore.getState().role).toBe('PATIENT');
  });

  it('should resolve unavailable and keep the tab signed in when the request itself fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    useSessionStore.getState().setSession({ ...LIVE_SESSION, role: 'PATIENT' });
    setAccessToken('a.b.c');
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new TypeError('offline'));

    await expect(refreshSession()).resolves.toBe('unavailable');

    expect(getAccessToken()).toBe('a.b.c');
    expect(useSessionStore.getState().role).toBe('PATIENT');
  });
});

describe('ensureSession', () => {
  const NOW = Date.parse('2026-10-16T10:00:00Z');

  it('should hydrate the store when it is empty', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse(LIVE_SESSION, 200));

    await ensureSession(NOW);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().hydrated).toBe(true);
  });

  it('should reuse a live session instead of rotating the refresh token again', async () => {
    useSessionStore.getState().setSession({ ...LIVE_SESSION, role: 'PATIENT', accessToken: 'a.b.c', expiresAt: '2026-10-16T10:10:00.000Z' });
    const fetchSpy = jest.spyOn(global, 'fetch');

    await ensureSession(NOW);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should exchange again when the access token is about to expire', async () => {
    useSessionStore.getState().setSession({ ...LIVE_SESSION, role: 'PATIENT', accessToken: 'a.b.c', expiresAt: '2026-10-16T10:00:30.000Z' });
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse(LIVE_SESSION, 200));

    await ensureSession(NOW);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('endSession and logout', () => {
  const assignSpy = jest.fn();

  beforeEach(() => {
    assignSpy.mockReset();
    useBookingDraftStore.getState().clearDraft();
    Object.defineProperty(window, 'location', { value: { pathname: '/appointments', search: '', assign: assignSpy }, writable: true });
  });

  it('should send the in-memory Bearer to the logout route and forget the session', async () => {
    setAccessToken('a.b.c');
    useSessionStore.getState().setSession({ ...LIVE_SESSION, role: 'PATIENT' });
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({ loggedOut: true }, 200));

    await endSession();

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('/api/auth/logout');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer a.b.c');
    expect(getAccessToken()).toBeNull();
    expect(useSessionStore.getState().role).toBeNull();
  });

  it('should clear the local session even when the logout request fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    setAccessToken('a.b.c');
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new TypeError('offline'));

    await expect(endSession()).resolves.toBeUndefined();

    expect(getAccessToken()).toBeNull();
  });

  it('should return to the home page after a user-initiated logout', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({ loggedOut: true }, 200));

    await logout();

    expect(assignSpy).toHaveBeenCalledWith('/');
  });

  it('should forget the booking draft when the user signs out', async () => {
    useBookingDraftStore.getState().updateDraft({ doctorId: 'doc-1', serviceId: 'svc-1', step: 4 });
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({ loggedOut: true }, 200));

    await logout();

    expect(useBookingDraftStore.getState().serviceId).toBeNull();
    expect(useBookingDraftStore.getState().doctorId).toBeNull();
  });

  it('should forget the unfinished encounter forms of this browser when the user signs out', async () => {
    writeDraft('1442', { summary: 'ОРВИ', diagnoses: [{ code: '', display: '' }], recommendations: '', observations: [], serviceRequests: [], medicationRequests: [] });
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({ loggedOut: true }, 200));

    await logout();

    expect(readDraft('1442')).toBeNull();
  });

  it('should bring the visitor back to the page with its query, so a chosen day or period survives signing in again', async () => {
    Object.defineProperty(window, 'location', { value: { pathname: '/doctor/appointments', search: '?date=2026-10-05', assign: assignSpy }, writable: true });
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ loggedOut: true }, 200));

    expect(currentReturnTo()).toBe('/doctor/appointments?date=2026-10-05');
    redirectToLogin();
    expect(assignSpy).toHaveBeenLastCalledWith('/login?returnTo=%2Fdoctor%2Fappointments%3Fdate%3D2026-10-05');
    await endRevokedSession();

    expect(assignSpy).toHaveBeenLastCalledWith('/login?returnTo=%2Fdoctor%2Fappointments%3Fdate%3D2026-10-05&reason=session-ended');
  });

  it('should end an idle session with the idle reason, a flash and no drafts left behind', async () => {
    Object.defineProperty(window, 'location', { value: { pathname: '/doctor/appointments', search: '', assign: assignSpy }, writable: true });
    useBookingDraftStore.getState().updateDraft({ doctorId: 'doc-1', step: 3 });
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({ loggedOut: true }, 200));

    await endIdleSession();

    expect(assignSpy).toHaveBeenLastCalledWith('/login?returnTo=%2Fdoctor%2Fappointments&reason=session-idle');
    expect(consumeFlash()).toBe('session-idle');
    expect(useBookingDraftStore.getState().doctorId).not.toBe('doc-1');
  });

  it('should keep the booking draft when the session was revoked, so the visitor returns to it after signing in', async () => {
    useBookingDraftStore.getState().updateDraft({ doctorId: 'doc-1', step: 3 });
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({ loggedOut: true }, 200));

    await endRevokedSession();

    expect(useBookingDraftStore.getState().doctorId).toBe('doc-1');
  });

  it('should clear the drafts and open the closed-account page after the account was closed', async () => {
    useBookingDraftStore.getState().updateDraft({ doctorId: 'doc-1', step: 3 });
    setAccessToken('a.b.c');
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({ loggedOut: true }, 200));

    await endClosedAccountSession();

    expect(assignSpy).toHaveBeenLastCalledWith('/account-closed');
    expect(getAccessToken()).toBeNull();
    expect(useBookingDraftStore.getState().doctorId).toBeNull();
  });
});
