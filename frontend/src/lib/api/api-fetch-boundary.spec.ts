import { apiFetch, ApiError, idempotencyKey } from './api-fetch';
import type { ProblemDetails } from './problem';

function problem(overrides: Partial<ProblemDetails> = {}): ProblemDetails {
  return {
    title: 'Conflict',
    status: 409,
    errorCode: 'SLOT_CONFLICT',
    ...overrides,
  };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('apiFetch boundary pipeline', () => {
  const assignSpy = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    assignSpy.mockReset();
    Object.defineProperty(window, 'location', {
      value: { pathname: '/booking', search: '?step=4', assign: assignSpy },
      writable: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should resolve JSON on success', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({ id: 'a1' }, 200));

    await expect(apiFetch<{ id: string }>('/api/v1/appointments')).resolves.toEqual({ id: 'a1' });
  });

  it('should resolve undefined on 204 with no body', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(apiFetch('/api/v1/appointments/a1')).resolves.toBeUndefined();
  });

  it('should throw ApiError with the problem payload on 409 SLOT_CONFLICT', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse(problem(), 409));

    const error = await apiFetch('/api/v1/appointments').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).problem.errorCode).toBe('SLOT_CONFLICT');
    expect((error as ApiError).status).toBe(409);
  });

  it('should logout and redirect on TOKEN_REVOKED without attempting refresh', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    fetchSpy.mockResolvedValueOnce(jsonResponse(problem({ status: 401, errorCode: 'TOKEN_REVOKED' }), 401));
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));

    await expect(apiFetch('/api/v1/appointments')).rejects.toBeInstanceOf(ApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1]?.[0]).toBe('/api/auth/logout');
    expect(assignSpy).toHaveBeenCalledWith(expect.stringContaining('/login?returnTo='));
  });

  it('should retry once after a successful silent refresh on 401', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    fetchSpy.mockResolvedValueOnce(jsonResponse(problem({ status: 401, errorCode: 'UNAUTHENTICATED' }), 401));
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'a1' }, 200));

    await expect(apiFetch<{ id: string }>('/api/v1/appointments')).resolves.toEqual({ id: 'a1' });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it('should redirect to login when silent refresh fails', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    fetchSpy.mockResolvedValueOnce(jsonResponse(problem({ status: 401, errorCode: 'UNAUTHENTICATED' }), 401));
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'refresh_failed' }), { status: 401 }));

    await expect(apiFetch('/api/v1/appointments')).rejects.toBeInstanceOf(ApiError);
    expect(assignSpy).toHaveBeenCalledWith('/login?returnTo=%2Fbooking%3Fstep%3D4');
  });

  it('should not retry when retry is disabled', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    fetchSpy.mockResolvedValueOnce(jsonResponse(problem({ status: 401, errorCode: 'UNAUTHENTICATED' }), 401));

    await expect(apiFetch('/api/v1/appointments', { retry: false })).rejects.toBeInstanceOf(ApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('idempotencyKey', () => {
  it('should generate a UUID-shaped key', () => {
    const key = idempotencyKey();
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('should generate a fresh key per booking intent', () => {
    expect(idempotencyKey()).not.toBe(idempotencyKey());
  });
});
