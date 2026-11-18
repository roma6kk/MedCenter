import { clearAccessToken, getAccessToken, setAccessToken } from '@/lib/auth/access-token';
import { apiFetch, ApiError } from './api-fetch';
import type { ProblemDetails } from './problem';
import { shouldRetryRead } from './query-client';

function unauthorized(errorCode: ProblemDetails['errorCode']): ProblemDetails {
  return { title: 'Unauthorized', status: 401, errorCode };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Answer = Response | Error;

function settle(answer: Answer): Promise<Response> {
  return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
}

describe('apiFetch silent refresh / revoke', () => {
  const assignSpy = jest.fn();
  let fetchSpy: jest.SpyInstance;

  function route(refresh: () => Answer, business: (call: number) => Response, logout?: () => Response): void {
    let businessCalls = 0;
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/auth/refresh') return settle(refresh());
      if (url === '/api/auth/logout' && logout) return settle(logout());
      businessCalls += 1;
      return settle(business(businessCalls));
    });
  }

  function callsTo(url: string): number {
    return fetchSpy.mock.calls.filter((call) => String(call[0]) === url).length;
  }

  const refreshOk = (): Response => jsonResponse({ ok: true }, 200);
  const unauthenticated = (): Response => jsonResponse(unauthorized('UNAUTHENTICATED'), 401);

  beforeEach(() => {
    jest.resetAllMocks();
    assignSpy.mockReset();
    Object.defineProperty(window, 'location', {
      value: { pathname: '/appointments', search: '', assign: assignSpy },
      writable: true,
    });
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should share a single refresh across concurrent 401 responses', async () => {
    route(refreshOk, (call) => (call <= 2 ? unauthenticated() : jsonResponse({ id: 'a1' }, 200)));

    const [first, second] = await Promise.all([
      apiFetch<{ id: string }>('/api/v1/appointments'),
      apiFetch<{ id: string }>('/api/v1/prescriptions'),
    ]);

    expect(callsTo('/api/auth/refresh')).toBe(1);
    expect(first).toEqual({ id: 'a1' });
    expect(second).toEqual({ id: 'a1' });
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it('should retry with retry disabled so a second 401 cannot loop', async () => {
    route(refreshOk, unauthenticated);

    await expect(apiFetch('/api/v1/appointments')).rejects.toBeInstanceOf(ApiError);
    expect(callsTo('/api/v1/appointments')).toBe(2);
    expect(callsTo('/api/auth/refresh')).toBe(1);
  });

  it('should POST to logout and redirect on TOKEN_REVOKED without calling refresh', async () => {
    route(refreshOk, () => jsonResponse(unauthorized('TOKEN_REVOKED'), 401), () => new Response(null, { status: 200 }));

    await expect(apiFetch('/api/v1/appointments')).rejects.toBeInstanceOf(ApiError);

    expect(callsTo('/api/auth/logout')).toBe(1);
    expect(callsTo('/api/auth/refresh')).toBe(0);
    expect(assignSpy).toHaveBeenCalledWith('/login?returnTo=%2Fappointments&reason=session-ended');
  });

  it('should preserve the ApiError problem payload when refresh fails', async () => {
    route(() => new Response(null, { status: 401 }), unauthenticated);

    const error = await apiFetch('/api/v1/appointments').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).problem.errorCode).toBe('UNAUTHENTICATED');
    expect((error as ApiError).status).toBe(401);
  });

  it('should fail like a retryable 503 and keep the session when the token service does not answer the refresh', async () => {
    setAccessToken('a.b.c');
    route(() => jsonResponse({ error: 'auth_unavailable' }, 503), unauthenticated);

    const error = await apiFetch('/api/v1/appointments').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(503);
    expect(shouldRetryRead(0, error)).toBe(true);
    expect(callsTo('/api/v1/appointments')).toBe(1);
    expect(assignSpy).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe('a.b.c');
    clearAccessToken();
  });

  it('should fail like a retryable 503, not redirect, when the refresh request itself is lost', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    route(() => new TypeError('network down'), unauthenticated);

    await expect(apiFetch('/api/v1/appointments')).rejects.toMatchObject({ status: 503 });

    expect(assignSpy).not.toHaveBeenCalled();
  });
});
