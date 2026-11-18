/** @jest-environment node */
import { NextRequest } from 'next/server';
import { fakeAccessToken, jsonResponse, tokenEndpointBody } from '@/lib/auth/jwt-fixture';
import { resetRotationGraceForTests } from '@/lib/auth/session-broker';
import { POST } from './route';

function logout(cookie: string | null, bearer: string | null = null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {};
  if (cookie !== null) headers['cookie'] = cookie;
  if (bearer !== null) headers['authorization'] = `Bearer ${bearer}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return POST(new NextRequest('http://0.0.0.0:3000/api/auth/logout', { method: 'POST', headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }));
}

function calls(spy: jest.SpyInstance): ReadonlyArray<{ readonly url: string; readonly init: RequestInit }> {
  return (spy.mock.calls as Array<[string, RequestInit]>).map(([url, init]) => ({ url, init }));
}

type Call = { readonly url: string; readonly init: RequestInit } | undefined;

function expectRevoke(call: Call, bearer: string, refreshToken?: string): void {
  expect(call?.url).toBe('http://auth.test:3000/oauth/token/revoke');
  expect((call?.init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${bearer}`);
  if (refreshToken !== undefined) expect(JSON.parse(String(call?.init.body))).toMatchObject({ refreshToken });
}

describe('POST /api/auth/logout', () => {
  const originalEnv = { ...process.env };
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env['AUTH_BACKEND_URL'] = 'http://auth.test:3000';
    resetRotationGraceForTests();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it('should revoke the refresh cookie with the Bearer the client sent', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ revoked: true }));

    await logout('mc_rt=refresh-1', 'access-1');

    const [revoke] = calls(fetchSpy);
    expectRevoke(revoke, 'access-1', 'refresh-1');
  });

  it('should forward the idle reason of the client to the revoke call and ignore any other reason', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ revoked: true }));

    await logout('mc_rt=refresh-1', 'access-1', { reason: 'idle' });
    await logout('mc_rt=refresh-1', 'access-1', { reason: 'whatever' });

    const [idle, other] = calls(fetchSpy);
    expect(JSON.parse(String(idle?.init.body))).toMatchObject({ reason: 'idle' });
    expect(JSON.parse(String(other?.init.body))).not.toHaveProperty('reason');
  });

  it('should use the cached access-token cookie as the Bearer when the client sent none, without minting a new pair', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ revoked: true }));

    await logout('mc_rt=refresh-1; mc_at=cached-access');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [revoke] = calls(fetchSpy);
    expectRevoke(revoke, 'cached-access', 'refresh-1');
  });

  it('should mint a Bearer from the refresh cookie when there is neither a client nor a cached one and revoke the NEW pair', async () => {
    const minted = fakeAccessToken();
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(tokenEndpointBody({ access_token: minted, refresh_token: 'refresh-2' })))
      .mockResolvedValueOnce(jsonResponse({ revoked: true }));

    await logout('mc_rt=refresh-1');

    const [rotate, revoke] = calls(fetchSpy);
    expect(rotate?.url).toBe('http://auth.test:3000/oauth/token');
    expectRevoke(revoke, minted, 'refresh-2');
  });

  it('should clear both session cookies and answer 200', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ revoked: true }));

    const response = await logout('mc_rt=refresh-1', 'access-1');

    expect(response.status).toBe(200);
    const cleared = response.headers.getSetCookie().filter((cookie) => /Max-Age=0|1970/.test(cookie)).map((cookie) => cookie.split('=')[0] ?? '');
    expect([...new Set(cleared)].sort()).toEqual(['mc_at', 'mc_rt', 'mc_session']);
  });

  it('should clear the refresh cookie on both the broker path and the legacy root path', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ revoked: true }));

    const response = await logout('mc_rt=refresh-1', 'access-1');

    const paths = response.headers.getSetCookie().filter((cookie) => cookie.startsWith('mc_rt=;')).map((cookie) => /Path=([^;]+)/.exec(cookie)?.[1]);
    expect(paths.sort()).toEqual(['/', '/api/auth']);
  });

  it('should rotate and revoke the NEW pair when the Bearer the client sent has expired and the first revoke is refused', async () => {
    const minted = fakeAccessToken();
    fetchSpy
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse(tokenEndpointBody({ access_token: minted, refresh_token: 'refresh-2' })))
      .mockResolvedValueOnce(jsonResponse({ revoked: true }));

    const response = await logout('mc_rt=refresh-1', 'expired-access');

    const [stale, rotate, revoke] = calls(fetchSpy);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expectRevoke(stale, 'expired-access');
    expect(rotate?.url).toBe('http://auth.test:3000/oauth/token');
    expectRevoke(revoke, minted, 'refresh-2');
    expect(response.status).toBe(200);
  });

  it('should not rotate again when the first revoke succeeded', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ revoked: false }));

    await logout('mc_rt=refresh-1', 'access-1');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('should still log the user out of this browser when auth-service is unreachable', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'));

    const response = await logout('mc_rt=refresh-1', 'access-1');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ loggedOut: true });
  });

  it('should not call auth-service when there is no refresh cookie', async () => {
    const response = await logout(null);

    expect(response.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
