import { loadSession } from './session-client';
import { getAccessToken, clearAccessToken } from './access-token';
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
