import { apiFetch } from './api-fetch';
import { setAccessToken, clearAccessToken, getAccessToken } from '@/lib/auth/access-token';

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function readHeaders(init: RequestInit | undefined): Headers {
  return new Headers(init?.headers);
}

describe('apiFetch authorization wiring', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    clearAccessToken();
    Object.defineProperty(window, 'location', {
      value: { pathname: '/appointments', search: '', assign: jest.fn() },
      writable: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    clearAccessToken();
  });

  it('should attach the Bearer token when a session is present', async () => {
    setAccessToken('a.b.c');
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(okJson({ id: 'x' }));

    await apiFetch('/api/v1/me/appointments');

    expect(readHeaders(fetchSpy.mock.calls[0]?.[1]).get('Authorization')).toBe('Bearer a.b.c');
  });

  it('should omit the Authorization header when signed out', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(okJson({ id: 'x' }));

    await apiFetch('/api/v1/doctors');

    expect(readHeaders(fetchSpy.mock.calls[0]?.[1]).has('Authorization')).toBe(false);
  });

  it('should clear the in-memory token when the server reports TOKEN_REVOKED', async () => {
    setAccessToken('a.b.c');
    const fetchSpy = jest.spyOn(global, 'fetch');
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ title: 'Revoked', status: 401, errorCode: 'TOKEN_REVOKED' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));

    await expect(apiFetch('/api/v1/me/appointments')).rejects.toThrow();

    expect(getAccessToken()).toBeNull();
  });

  it('should leave the content type to the browser when the body is a form (multipart boundary)', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(okJson({ scanId: 's1' }));
    const form = new FormData();
    form.append('file', new Blob(['x'], { type: 'application/pdf' }), 'scan.pdf');

    await apiFetch('/api/v1/patients/p1/consent/scan', { method: 'POST', body: form });

    expect(readHeaders(fetchSpy.mock.calls[0]?.[1]).has('Content-Type')).toBe(false);
  });

  it('should hand back the bytes when the answer is asked for as a blob', async () => {
    // jsdom's Response has no blob(): a minimal stand-in carries the bytes.
    const answer = { ok: true, status: 200, blob: () => Promise.resolve(new Blob(['%PDF'], { type: 'application/pdf' })) } as unknown as Response;
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(answer);

    const blob = await apiFetch<Blob>('/api/v1/patients/p1/consent/scan/s1', { responseAs: 'blob' });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
  });
});
