/** @jest-environment node */
import { NextRequest } from 'next/server';
import { fakeAccessToken, jsonResponse, tokenEndpointBody } from '@/lib/auth/jwt-fixture';
import { resetRotationGraceForTests } from '@/lib/auth/session-broker';
import { POST } from './route';

function refresh(cookie: string | null): Promise<Response> {
  const headers: Record<string, string> = cookie === null ? {} : { cookie };
  return POST(new NextRequest('http://0.0.0.0:3000/api/auth/refresh', { method: 'POST', headers }));
}

describe('POST /api/auth/refresh', () => {
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

  it('should answer 401 when there is no refresh cookie', async () => {
    const response = await refresh(null);

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should return a new access token with the session claims and rotate the cookie', async () => {
    const accessToken = fakeAccessToken({ role: 'DOCTOR', patient: undefined, fhirUser: 'PractitionerRole/6ef5' });
    fetchSpy.mockResolvedValueOnce(jsonResponse(tokenEndpointBody({ access_token: accessToken, refresh_token: 'refresh-2' })));

    const response = await refresh('mc_rt=refresh-1');

    expect(await response.json()).toMatchObject({ accessToken, role: 'DOCTOR', fhirUser: 'PractitionerRole/6ef5' });
    expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith('mc_rt=refresh-2'))).toBe(true);
  });

  it('should rotate even when a still-valid access-token cookie exists, because the caller was just told that token is bad', async () => {
    const stillValid = fakeAccessToken({ exp: Math.floor(Date.now() / 1000) + 600 });
    fetchSpy.mockResolvedValueOnce(jsonResponse(tokenEndpointBody({ refresh_token: 'refresh-2' })));

    const response = await refresh(`mc_rt=refresh-1; mc_at=${stillValid}`);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(((await response.json()) as { accessToken: string }).accessToken).not.toBe(stillValid);
  });

  it('should answer 401 and clear the cookies when the refresh token was already used', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ error: 'invalid_grant' }, 400));

    const response = await refresh('mc_rt=used');

    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith('mc_rt=') && /Max-Age=0|1970/.test(cookie))).toBe(true);
  });

  it('should answer 503 without clearing the cookies when auth-service is down', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'));

    const response = await refresh('mc_rt=refresh-1');

    expect(response.status).toBe(503);
    expect(response.headers.getSetCookie()).toEqual([]);
  });
});
