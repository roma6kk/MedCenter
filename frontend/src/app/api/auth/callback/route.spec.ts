/** @jest-environment node */
import { NextRequest } from 'next/server';
import { fakeAccessToken, jsonResponse, tokenEndpointBody } from '@/lib/auth/jwt-fixture';
import { buildState } from '@/lib/auth/callback-flow';
import { GET } from './route';

const CONTAINER_ORIGIN = 'http://0.0.0.0:3000';
const PKCE = encodeURIComponent(JSON.stringify({ verifier: 'verifier-1', state: 'state-1' }));

function callback(query: string, cookie: string | null = `mc_pkce=${PKCE}`): Promise<Response> {
  const headers: Record<string, string> = cookie === null ? {} : { cookie };
  return GET(new NextRequest(`${CONTAINER_ORIGIN}/api/auth/callback?${query}`, { headers }));
}

function validQuery(returnTo: string | null = '/appointments'): string {
  return `code=c1&state=${encodeURIComponent(buildState('state-1', returnTo))}`;
}

function setCookies(response: Response): ReadonlyArray<string> {
  return response.headers.getSetCookie();
}

describe('GET /api/auth/callback', () => {
  const originalEnv = { ...process.env };
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    delete process.env['APP_PUBLIC_URL'];
    process.env['AUTH_BACKEND_URL'] = 'http://auth.test:3000';
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it('should exchange the code with the public redirect_uri and the cookie verifier', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(tokenEndpointBody()));

    await callback(validQuery());

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(String(init.body));
    expect(body.get('redirect_uri')).toBe('http://localhost:3000/api/auth/callback');
    expect(body.get('code_verifier')).toBe('verifier-1');
    expect(body.get('code')).toBe('c1');
  });

  it('should redirect to the returnTo on the public origin, not on the container bind address', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(tokenEndpointBody()));

    const response = await callback(validQuery('/appointments'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/appointments');
  });

  it('should use APP_PUBLIC_URL for the post-login redirect', async () => {
    process.env['APP_PUBLIC_URL'] = 'https://med.example.by';
    fetchSpy.mockResolvedValueOnce(jsonResponse(tokenEndpointBody()));

    const response = await callback(validQuery('/appointments'));

    expect(response.headers.get('location')).toBe('https://med.example.by/appointments');
  });

  it('should store the refresh token in an httpOnly cookie and drop the PKCE cookie', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(tokenEndpointBody({ refresh_token: 'rt-secret' })));

    const cookies = setCookies(await callback(validQuery()));

    const refresh = cookies.find((cookie) => cookie.startsWith('mc_rt=rt-secret')) ?? '';
    expect(refresh).toContain('rt-secret');
    expect(refresh).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/Max-Age=1209600/);
    expect(cookies.find((cookie) => cookie.startsWith('mc_session='))).toBeDefined();
    expect(cookies.find((cookie) => cookie.startsWith('mc_pkce='))).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
  });

  it('should cache the access token in a broker-scoped cookie so the first /session call needs no token request', async () => {
    const accessToken = fakeAccessToken();
    fetchSpy.mockResolvedValueOnce(jsonResponse(tokenEndpointBody({ access_token: accessToken })));

    const cookies = setCookies(await callback(validQuery()));

    const cached = cookies.find((cookie) => cookie.startsWith('mc_at=')) ?? '';
    expect(cached.split(';')[0]).toBe(`mc_at=${accessToken}`);
    expect(cached).toMatch(/Path=\/api\/auth/);
    expect(cached).toMatch(/Max-Age=900/);
  });

  it('should scope the refresh cookie to the broker so page and API requests never carry it', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(tokenEndpointBody({ refresh_token: 'rt-secret' })));

    const cookies = setCookies(await callback(validQuery()));

    expect(cookies.find((cookie) => cookie.startsWith('mc_rt=rt-secret'))).toMatch(/Path=\/api\/auth/);
    expect(cookies.find((cookie) => cookie.startsWith('mc_session='))).toMatch(/Path=\/(;|$)/);
  });

  it('should keep the Secure flag off for the plain-http dev origin and on for https', async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(jsonResponse(tokenEndpointBody())));

    const http = setCookies(await callback(validQuery())).find((cookie) => cookie.startsWith('mc_rt=refresh-next')) ?? '';
    process.env['APP_PUBLIC_URL'] = 'https://med.example.by';
    const https = setCookies(await callback(validQuery())).find((cookie) => cookie.startsWith('mc_rt=refresh-next')) ?? '';

    expect(http).not.toMatch(/Secure/i);
    expect(https).toMatch(/Secure/i);
  });

  it.each([
    ['DOCTOR', '/booking', 'http://localhost:3000/doctor/appointments'],
    ['ADMIN', '/booking', 'http://localhost:3000/admin/analytics'],
    ['PATIENT', '/admin/users', 'http://localhost:3000/booking'],
    ['DOCTOR', '/doctor/schedule', 'http://localhost:3000/doctor/schedule'],
  ])('should send a %s who asked for %s to %s', async (role, requested, expected) => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(tokenEndpointBody({ access_token: fakeAccessToken({ role }) })));

    const response = await callback(validQuery(requested));

    expect(response.headers.get('location')).toBe(expected);
  });

  it('should land on the role page when no returnTo was requested', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(tokenEndpointBody({ access_token: fakeAccessToken({ role: 'ADMIN' }) })));

    const response = await callback(validQuery(null));

    expect(response.headers.get('location')).toBe('http://localhost:3000/admin/analytics');
  });

  it('should ignore an off-site returnTo and land on the role page', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(tokenEndpointBody()));

    const response = await callback(validQuery('https://evil.example.com/phish'));

    expect(response.headers.get('location')).toBe('http://localhost:3000/booking');
  });

  it.each([
    ['there is no PKCE cookie', 'code=c1&state=state-1', null],
    ['the state does not match the cookie', 'code=c1&state=forged', `mc_pkce=${PKCE}`],
    ['there is no code', 'state=state-1', `mc_pkce=${PKCE}`],
    ['the authorization server denied access', 'error=access_denied&state=state-1', `mc_pkce=${PKCE}`],
  ])('should fail closed without calling auth-service when %s', async (_label, query, cookie) => {
    const response = await callback(query, cookie);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe('http://localhost:3000/login?error=access_denied');
    expect(setCookies(response).find((header) => header.startsWith('mc_rt='))).toBeUndefined();
  });

  it('should return to the login page when auth-service rejects the code', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ error: 'invalid_grant' }, 400));

    const response = await callback(validQuery());

    expect(response.headers.get('location')).toBe('http://localhost:3000/login?error=access_denied');
    expect(setCookies(response).find((header) => header.startsWith('mc_rt='))).toBeUndefined();
  });

  it('should return to the login page when auth-service is unreachable', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'));

    const response = await callback(validQuery());

    expect(response.headers.get('location')).toBe('http://localhost:3000/login?error=access_denied');
  });

  it('should not set a refresh cookie from a token body without a refresh token', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ access_token: 'a.b.c', expires_in: 900 }));

    const response = await callback(validQuery());

    expect(setCookies(response).find((header) => header.startsWith('mc_rt='))).toBeUndefined();
  });
});
