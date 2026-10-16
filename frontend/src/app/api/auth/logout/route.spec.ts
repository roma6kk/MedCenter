/** @jest-environment node */
import { NextRequest } from 'next/server';
import { fakeAccessToken, jsonResponse, tokenEndpointBody } from '@/lib/auth/jwt-fixture';
import { resetRotationGraceForTests } from '@/lib/auth/session-broker';
import { POST } from './route';

function logout(cookie: string | null, bearer: string | null = null): Promise<Response> {
  const headers: Record<string, string> = {};
  if (cookie !== null) headers['cookie'] = cookie;
  if (bearer !== null) headers['authorization'] = `Bearer ${bearer}`;
  return POST(new NextRequest('http://0.0.0.0:3000/api/auth/logout', { method: 'POST', headers }));
}

function calls(spy: jest.SpyInstance): ReadonlyArray<{ readonly url: string; readonly init: RequestInit }> {
  return (spy.mock.calls as Array<[string, RequestInit]>).map(([url, init]) => ({ url, init }));
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
    expect(revoke?.url).toBe('http://auth.test:3000/oauth/token/revoke');
    expect((revoke?.init.headers as Record<string, string>)['Authorization']).toBe('Bearer access-1');
    expect(JSON.parse(String(revoke?.init.body))).toMatchObject({ refreshToken: 'refresh-1' });
  });

  it('should use the cached access-token cookie as the Bearer when the client sent none, without minting a new pair', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ revoked: true }));

    await logout('mc_rt=refresh-1; mc_at=cached-access');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [revoke] = calls(fetchSpy);
    expect(revoke?.url).toBe('http://auth.test:3000/oauth/token/revoke');
    expect((revoke?.init.headers as Record<string, string>)['Authorization']).toBe('Bearer cached-access');
    expect(JSON.parse(String(revoke?.init.body))).toMatchObject({ refreshToken: 'refresh-1' });
  });

  it('should mint a Bearer from the refresh cookie when there is neither a client nor a cached one and revoke the NEW pair', async () => {
    const minted = fakeAccessToken();
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(tokenEndpointBody({ access_token: minted, refresh_token: 'refresh-2' })))
      .mockResolvedValueOnce(jsonResponse({ revoked: true }));

    await logout('mc_rt=refresh-1');

    const [rotate, revoke] = calls(fetchSpy);
    expect(rotate?.url).toBe('http://auth.test:3000/oauth/token');
    expect(revoke?.url).toBe('http://auth.test:3000/oauth/token/revoke');
    expect((revoke?.init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${minted}`);
    expect(JSON.parse(String(revoke?.init.body))).toMatchObject({ refreshToken: 'refresh-2' });
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

  it('should still log the user out of this browser when auth-service is unreachable', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'));

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
