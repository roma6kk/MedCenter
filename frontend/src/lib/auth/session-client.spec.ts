import { endSession, ensureSession, loadSession, logout, refreshSession } from './session-client';
import { getAccessToken, clearAccessToken, setAccessToken } from './access-token';
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
  });
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('loadSession', () => {
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

  it('should mark hydrated and stay signed out when the broker is unreachable', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('network down'));

    await loadSession();

    expect(getAccessToken()).toBeNull();
    expect(useSessionStore.getState().hydrated).toBe(true);
  });

  it('should mark hydrated and clear the token on a non-ok broker response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(null, { status: 500 }));

    await loadSession();

    expect(getAccessToken()).toBeNull();
    expect(useSessionStore.getState().hydrated).toBe(true);
  });
});

const LIVE_SESSION = {
  accessToken: 'a.b.c',
  expiresAt: '2026-10-16T10:15:00.000Z',
  role: 'PATIENT',
  scope: 'patient/*.read',
  patientRef: '1439',
  fhirUser: null,
};

describe('session exchange single flight', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    clearAccessToken();
    resetStore();
  });

  it('should share one request between a mount-time load and a StrictMode double load', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(LIVE_SESSION, 200));

    await Promise.all([loadSession(), loadSession()]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('should share the in-flight load with a refresh triggered by a 401 so the single-use token is rotated once', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(LIVE_SESSION, 200));

    const [, refreshed] = await Promise.all([loadSession(), refreshSession()]);

    expect(refreshed).toBe(true);
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
  beforeEach(() => {
    jest.restoreAllMocks();
    clearAccessToken();
    resetStore();
  });

  it('should POST to the refresh endpoint and update the token and the store', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse(LIVE_SESSION, 200));

    const refreshed = await refreshSession();

    expect(refreshed).toBe(true);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('/api/auth/refresh');
    expect((fetchSpy.mock.calls[0]?.[1] as RequestInit).method).toBe('POST');
    expect(getAccessToken()).toBe('a.b.c');
    expect(useSessionStore.getState().role).toBe('PATIENT');
  });

  it('should keep the current session when a 200 body carries no token field at all', async () => {
    useSessionStore.getState().setSession({ ...LIVE_SESSION, role: 'PATIENT' });
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({ ok: true }, 200));

    await expect(refreshSession()).resolves.toBe(true);

    expect(useSessionStore.getState().role).toBe('PATIENT');
  });

  it('should sign the tab out and resolve false when the refresh is refused', async () => {
    useSessionStore.getState().setSession({ ...LIVE_SESSION, role: 'PATIENT' });
    setAccessToken('a.b.c');
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(null, { status: 401 }));

    await expect(refreshSession()).resolves.toBe(false);

    expect(getAccessToken()).toBeNull();
    expect(useSessionStore.getState().role).toBeNull();
  });
});

describe('ensureSession', () => {
  const NOW = Date.parse('2026-10-16T10:00:00Z');

  beforeEach(() => {
    jest.restoreAllMocks();
    clearAccessToken();
    resetStore();
  });

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
    jest.restoreAllMocks();
    assignSpy.mockReset();
    clearAccessToken();
    resetStore();
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

  it('should return to the login screen after a user-initiated logout', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({ loggedOut: true }, 200));

    await logout();

    expect(assignSpy).toHaveBeenCalledWith('/login');
  });
});
