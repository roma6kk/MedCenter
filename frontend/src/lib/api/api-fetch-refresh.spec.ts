import { apiFetch, ApiError } from './api-fetch';
import type { ProblemDetails } from './problem';

function unauthorized(errorCode: ProblemDetails['errorCode']): ProblemDetails {
  return { title: 'Unauthorized', status: 401, errorCode };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('apiFetch silent refresh / revoke', () => {
  const assignSpy = jest.fn();
  let fetchSpy: jest.SpyInstance;

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
    let businessCalls = 0;
    let refreshCalls = 0;
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/auth/refresh') {
        refreshCalls += 1;
        return Promise.resolve(jsonResponse({ ok: true }, 200));
      }
      businessCalls += 1;
      return Promise.resolve(
        businessCalls <= 2
          ? jsonResponse(unauthorized('UNAUTHENTICATED'), 401)
          : jsonResponse({ id: 'a1' }, 200),
      );
    });

    const [first, second] = await Promise.all([
      apiFetch<{ id: string }>('/api/v1/appointments'),
      apiFetch<{ id: string }>('/api/v1/prescriptions'),
    ]);

    expect(refreshCalls).toBe(1);
    expect(first).toEqual({ id: 'a1' });
    expect(second).toEqual({ id: 'a1' });
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it('should retry with retry disabled so a second 401 cannot loop', async () => {
    let businessCalls = 0;
    let refreshCalls = 0;
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/auth/refresh') {
        refreshCalls += 1;
        return Promise.resolve(jsonResponse({ ok: true }, 200));
      }
      businessCalls += 1;
      return Promise.resolve(jsonResponse(unauthorized('UNAUTHENTICATED'), 401));
    });

    await expect(apiFetch('/api/v1/appointments')).rejects.toBeInstanceOf(ApiError);
    // initial call + exactly one retry; the retried request must not trigger a second refresh
    expect(businessCalls).toBe(2);
    expect(refreshCalls).toBe(1);
  });

  it('should POST to logout and redirect on TOKEN_REVOKED without calling refresh', async () => {
    const refreshCalls: string[] = [];
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/auth/refresh') {
        refreshCalls.push(url);
        return Promise.resolve(jsonResponse({ ok: true }, 200));
      }
      if (url === '/api/auth/logout') {
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      return Promise.resolve(jsonResponse(unauthorized('TOKEN_REVOKED'), 401));
    });

    await expect(apiFetch('/api/v1/appointments')).rejects.toBeInstanceOf(ApiError);

    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain('/api/auth/logout');
    expect(refreshCalls).toHaveLength(0);
    expect(assignSpy).toHaveBeenCalledWith('/login?returnTo=%2Fappointments');
  });

  it('should preserve the ApiError problem payload when refresh fails', async () => {
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/auth/refresh') return Promise.resolve(new Response(null, { status: 401 }));
      return Promise.resolve(jsonResponse(unauthorized('UNAUTHENTICATED'), 401));
    });

    const error = await apiFetch('/api/v1/appointments').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).problem.errorCode).toBe('UNAUTHENTICATED');
    expect((error as ApiError).status).toBe(401);
  });
});
