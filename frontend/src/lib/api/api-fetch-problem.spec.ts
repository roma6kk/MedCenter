import { apiFetch, ApiError, isApiError } from './api-fetch';
import { clearAccessToken } from '@/lib/auth/access-token';
import { consumeFlash } from '@/lib/ui/flash-message';

interface FakeResponseInit {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
  /** `true`: `json()` rejects like an empty or HTML body does in a real browser. */
  readonly unparsable?: boolean;
}

function fakeResponse({ status, body, headers = {}, unparsable = false }: FakeResponseInit): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: () => (unparsable ? Promise.reject(new SyntaxError('Unexpected end of JSON input')) : Promise.resolve(body)),
  } as unknown as Response;
}

function requestHeaders(fetchSpy: jest.SpyInstance, call = 0): Headers {
  return new Headers((fetchSpy.mock.calls[call]?.[1] as RequestInit).headers);
}

describe('apiFetch problem handling', () => {
  const assignSpy = jest.fn();
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.restoreAllMocks();
    assignSpy.mockReset();
    clearAccessToken();
    window.sessionStorage.clear();
    Object.defineProperty(window, 'location', { value: { pathname: '/appointments', search: '?tab=past', assign: assignSpy }, writable: true });
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  it('should keep the field errors of a VALIDATION_ERROR on the ApiError', async () => {
    const details = [{ field: 'email', message: 'email must be an email' }];
    fetchSpy.mockResolvedValueOnce(fakeResponse({ status: 400, body: { title: 'BadRequestException', errorCode: 'VALIDATION_ERROR', details, requestId: 'r1' } }));

    const error = await apiFetch('/api/v1/auth/register', { method: 'POST', body: '{}' }).catch((e: unknown) => e);

    expect(isApiError(error)).toBe(true);
    expect((error as ApiError).problem).toMatchObject({ errorCode: 'VALIDATION_ERROR', details, requestId: 'r1' });
    expect((error as ApiError).errorCode).toBe('VALIDATION_ERROR');
  });

  it('should turn an HTML edge error into an INTERNAL problem instead of a JSON parse crash', async () => {
    fetchSpy.mockResolvedValueOnce(fakeResponse({ status: 502, unparsable: true, headers: { 'x-request-id': 'edge-1' } }));

    const error = await apiFetch('/api/v1/doctors').catch((e: unknown) => e);

    expect((error as ApiError).problem).toMatchObject({ status: 502, errorCode: 'INTERNAL', requestId: 'edge-1' });
  });

  it('should expose Retry-After of a 429 as retryAfter seconds', async () => {
    fetchSpy.mockResolvedValueOnce(fakeResponse({ status: 429, body: { errorCode: 'RATE_LIMITED' }, headers: { 'retry-after': '17' } }));

    const error = await apiFetch('/api/v1/appointments').catch((e: unknown) => e);

    expect((error as ApiError).problem.retryAfter).toBe(17);
  });

  it('should throw an ApiError with status 0 when the network is down', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const error = await apiFetch('/api/v1/doctors').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
  });

  it('should let an aborted request surface as the AbortError it is', async () => {
    fetchSpy.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));

    await expect(apiFetch('/api/v1/doctors')).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('should resolve undefined for a 200 without a JSON body', async () => {
    fetchSpy.mockResolvedValueOnce(fakeResponse({ status: 200, unparsable: true }));

    await expect(apiFetch('/api/v1/appointments/a1/noshow', { method: 'POST' })).resolves.toBeUndefined();
  });
});

describe('apiFetch request headers', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.restoreAllMocks();
    clearAccessToken();
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(fakeResponse({ status: 200, body: {} }));
  });

  it('should not send a Content-Type on a GET without a body', async () => {
    await apiFetch('/api/v1/doctors');

    expect(requestHeaders(fetchSpy).has('Content-Type')).toBe(false);
  });

  it('should send JSON when there is a body', async () => {
    await apiFetch('/api/v1/appointments', { method: 'POST', body: '{"slotId":"s1"}' });

    expect(requestHeaders(fetchSpy).get('Content-Type')).toBe('application/json');
  });

  it('should keep a Content-Type the caller set', async () => {
    await apiFetch('/api/v1/upload', { method: 'POST', body: 'x', headers: { 'Content-Type': 'text/plain' } });

    expect(requestHeaders(fetchSpy).get('Content-Type')).toBe('text/plain');
  });

  it('should pass the Idempotency-Key through unchanged', async () => {
    await apiFetch('/api/v1/appointments', { method: 'POST', body: '{}', headers: { 'Idempotency-Key': 'key-1' } });

    expect(requestHeaders(fetchSpy).get('Idempotency-Key')).toBe('key-1');
  });
});

describe('apiFetch session end', () => {
  const assignSpy = jest.fn();

  beforeEach(() => {
    jest.restoreAllMocks();
    assignSpy.mockReset();
    clearAccessToken();
    window.sessionStorage.clear();
    Object.defineProperty(window, 'location', { value: { pathname: '/appointments', search: '?tab=past', assign: assignSpy }, writable: true });
  });

  it('should leave a flash for the "session ended" toast when the token was revoked', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(fakeResponse({ status: 401, body: { errorCode: 'TOKEN_REVOKED' } }))
      .mockResolvedValueOnce(fakeResponse({ status: 200, body: { loggedOut: true } }));

    await apiFetch('/api/v1/appointments').catch(() => undefined);

    expect(consumeFlash()).toBe('session-ended');
    expect(assignSpy).toHaveBeenCalledWith('/login?returnTo=%2Fappointments%3Ftab%3Dpast');
  });

  it('should redirect to login when a refreshed token is rejected again', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(fakeResponse({ status: 401, body: { errorCode: 'UNAUTHENTICATED' } }))
      .mockResolvedValueOnce(fakeResponse({ status: 200, body: { accessToken: 'new.a.b' } }))
      .mockResolvedValueOnce(fakeResponse({ status: 401, body: { errorCode: 'UNAUTHENTICATED' } }));

    await expect(apiFetch('/api/v1/appointments')).rejects.toBeInstanceOf(ApiError);

    expect(assignSpy).toHaveBeenCalledWith('/login?returnTo=%2Fappointments%3Ftab%3Dpast');
  });

  it('should leave the 401 to the caller when retry is disabled', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(fakeResponse({ status: 401, body: { errorCode: 'UNAUTHENTICATED' } }));

    await expect(apiFetch('/api/v1/me', { retry: false })).rejects.toBeInstanceOf(ApiError);

    expect(assignSpy).not.toHaveBeenCalled();
  });
});
