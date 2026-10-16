/** @jest-environment node */
import { NextRequest } from 'next/server';
import { fakeAccessToken, jsonResponse, tokenEndpointBody } from '@/lib/auth/jwt-fixture';
import { resetRotationGraceForTests } from '@/lib/auth/session-broker';
import { GET } from './route';

function session(cookie: string | null): Promise<Response> {
  const headers: Record<string, string> = cookie === null ? {} : { cookie };
  return GET(new NextRequest('http://0.0.0.0:3000/api/auth/session', { headers }));
}

function setCookies(response: Response): ReadonlyArray<string> {
  return response.headers.getSetCookie();
}

function expiredNames(response: Response): ReadonlyArray<string> {
  return [...new Set(setCookies(response).filter((cookie) => /Max-Age=0|Expires=Thu, 01 Jan 1970/.test(cookie)).map((cookie) => cookie.split('=')[0] ?? ''))].sort();
}

describe('GET /api/auth/session', () => {
  const originalEnv = { ...process.env };
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    delete process.env['APP_PUBLIC_URL'];
    process.env['AUTH_BACKEND_URL'] = 'http://auth.test:3000';
    resetRotationGraceForTests();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it('should answer an anonymous visitor with 200 and no token without calling auth-service', async () => {
    const response = await session(null);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ accessToken: null, role: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should return the access token with the role and patient of its claims', async () => {
    const accessToken = fakeAccessToken({ role: 'PATIENT', patient: '1439' });
    fetchSpy.mockResolvedValueOnce(jsonResponse(tokenEndpointBody({ access_token: accessToken })));

    const body = (await (await session('mc_rt=refresh-1')).json()) as Record<string, unknown>;

    expect(body).toMatchObject({ accessToken, role: 'PATIENT', patientRef: '1439' });
  });

  it('should store the ROTATED refresh token back into the cookie so the next page load still works', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(tokenEndpointBody({ refresh_token: 'refresh-2' })));

    const response = await session('mc_rt=refresh-1');

    const refresh = setCookies(response).find((cookie) => cookie.startsWith('mc_rt=refresh-2')) ?? '';
    expect(refresh).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/Path=\/api\/auth/);
  });

  it('should cache the minted access token in a cookie that lives as long as the token', async () => {
    const accessToken = fakeAccessToken();
    fetchSpy.mockResolvedValueOnce(jsonResponse(tokenEndpointBody({ access_token: accessToken, expires_in: 900 })));

    const cookie = setCookies(await session('mc_rt=refresh-1')).find((header) => header.startsWith('mc_at=')) ?? '';

    expect(cookie.split(';')[0]).toBe(`mc_at=${accessToken}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Max-Age=900/);
    expect(cookie).toMatch(/Path=\/api\/auth/);
  });

  it('should never put the refresh token into the response body', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(tokenEndpointBody({ refresh_token: 'refresh-2' })));

    const text = await (await session('mc_rt=refresh-1')).text();

    expect(text).not.toContain('refresh-2');
  });

  it('should forbid caching of the session response', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(tokenEndpointBody()));

    expect((await session('mc_rt=refresh-1')).headers.get('cache-control')).toBe('no-store');
  });

  it('should serve two tabs that present the same cookie at once from one rotation', async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(jsonResponse(tokenEndpointBody())));

    const [first, second] = await Promise.all([session('mc_rt=refresh-1'), session('mc_rt=refresh-1')]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it('should clear the cookies and answer anonymous when the refresh token is no longer valid', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ error: 'invalid_grant' }, 400));

    const response = await session('mc_rt=stale');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ accessToken: null });
    expect(expiredNames(response)).toEqual(['mc_at', 'mc_rt', 'mc_session']);
  });

  it('should keep the cookies and answer 503 while auth-service is unavailable', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}, 503));

    const response = await session('mc_rt=refresh-1');

    expect(response.status).toBe(503);
    expect(setCookies(response)).toEqual([]);
  });

  describe('cached access token', () => {
    const NOW_S = Math.floor(Date.now() / 1000);

    function cookies(accessToken: string, refresh = 'refresh-1'): string {
      return `mc_rt=${refresh}; mc_at=${accessToken}`;
    }

    it('should answer from a still-valid access-token cookie without calling the token endpoint', async () => {
      const accessToken = fakeAccessToken({ role: 'PATIENT', patient: '1439', exp: NOW_S + 600 });

      const response = await session(cookies(accessToken));

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(await response.json()).toMatchObject({ accessToken, role: 'PATIENT', patientRef: '1439', expiresAt: new Date((NOW_S + 600) * 1000).toISOString() });
      expect(setCookies(response)).toEqual([]);
    });

    it('should rotate when the cached access token is about to expire', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse(tokenEndpointBody()));

      await session(cookies(fakeAccessToken({ exp: NOW_S + 30 })));

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('should rotate when the cached access token has already expired', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse(tokenEndpointBody()));

      await session(cookies(fakeAccessToken({ exp: NOW_S - 5 })));

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it.each([['not-a-jwt'], [fakeAccessToken({ role: 'SUPERUSER', exp: Math.floor(Date.now() / 1000) + 600 })], [fakeAccessToken({ exp: undefined })]])(
      'should not trust the access-token cookie %#',
      async (accessToken) => {
        fetchSpy.mockResolvedValueOnce(jsonResponse(tokenEndpointBody()));

        await session(cookies(accessToken));

        expect(fetchSpy).toHaveBeenCalledTimes(1);
      },
    );

    it('should treat a session without a refresh cookie as signed out even when an access token is left over', async () => {
      const response = await session(`mc_at=${fakeAccessToken({ exp: NOW_S + 600 })}`);

      expect(await response.json()).toMatchObject({ accessToken: null });
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
