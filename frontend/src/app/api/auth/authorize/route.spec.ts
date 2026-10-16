/** @jest-environment node */
import { NextRequest } from 'next/server';
import { GET } from './route';

const CONTAINER_ORIGIN = 'http://0.0.0.0:3000';

function authorize(query = ''): Promise<Response> {
  return GET(new NextRequest(`${CONTAINER_ORIGIN}/api/auth/authorize${query}`));
}

function locationOf(response: Response): URL {
  return new URL(response.headers.get('location') ?? '');
}

describe('GET /api/auth/authorize', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env['APP_PUBLIC_URL'];
    delete process.env['NEXT_PUBLIC_APP_URL'];
    process.env['AUTH_BACKEND_URL'] = 'http://medcenter.localhost:8081';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should register the public origin as redirect_uri even when the request came in on the bind address', async () => {
    const response = await authorize('?returnTo=%2Fappointments');

    expect(response.status).toBe(307);
    expect(locationOf(response).searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/auth/callback');
  });

  it('should use the configured APP_PUBLIC_URL for redirect_uri', async () => {
    process.env['APP_PUBLIC_URL'] = 'https://med.example.by';

    const response = await authorize();

    expect(locationOf(response).searchParams.get('redirect_uri')).toBe('https://med.example.by/api/auth/callback');
  });

  it('should redirect to the authorization endpoint of auth-service with an S256 challenge', async () => {
    const target = locationOf(await authorize());

    expect(`${target.origin}${target.pathname}`).toBe('http://medcenter.localhost:8081/oauth/authorize');
    expect(target.searchParams.get('code_challenge_method')).toBe('S256');
    expect(target.searchParams.get('response_type')).toBe('code');
    expect(target.searchParams.get('client_id')).toBe('medcenter-web');
    expect(target.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('should not request offline_access, which the client is never granted', async () => {
    const scope = locationOf(await authorize()).searchParams.get('scope') ?? '';

    expect(scope.split(' ')).toEqual(['launch', 'patient/*.read', 'patient/*.write', 'user/*.read', 'user/*.write']);
  });

  it('should keep the verifier in an httpOnly cookie and out of the URL', async () => {
    const response = await authorize();

    const setCookie = response.headers.getSetCookie().find((cookie) => cookie.startsWith('mc_pkce=')) ?? '';
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).not.toMatch(/Secure/i);
    const cookie = JSON.parse(decodeURIComponent(setCookie.split(';')[0]?.slice('mc_pkce='.length) ?? '')) as { verifier: string; state: string };
    expect(response.headers.get('location')).not.toContain(cookie.verifier);
    expect(locationOf(response).searchParams.get('state')?.startsWith(`${cookie.state}`)).toBe(true);
  });

  it('should mark the PKCE cookie Secure when the public origin is https', async () => {
    process.env['APP_PUBLIC_URL'] = 'https://med.example.by';

    const response = await authorize();

    expect(response.headers.getSetCookie().find((cookie) => cookie.startsWith('mc_pkce='))).toMatch(/Secure/i);
  });

  it('should carry a safe returnTo in the state', async () => {
    const state = locationOf(await authorize('?returnTo=%2Fdoctor%2Fappointments%3Ffrom%3D2026-10-16')).searchParams.get('state') ?? '';

    expect(decodeURIComponent(state.slice(state.indexOf('.') + 1))).toBe('/doctor/appointments?from=2026-10-16');
  });

  it.each([
    ['an absolute URL', 'https%3A%2F%2Fevil.example.com'],
    ['a protocol-relative URL', '%2F%2Fevil.example.com'],
    ['a javascript: URL', 'javascript%3Aalert(1)'],
  ])('should drop %s as returnTo', async (_label, evil) => {
    const state = locationOf(await authorize(`?returnTo=${evil}`)).searchParams.get('state') ?? '';

    expect(state).not.toContain('.');
  });
});
