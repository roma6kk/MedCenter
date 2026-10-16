/** @jest-environment node */
import { buildState, exchangeAuthorizationCode, parseCallback } from './callback-flow';
import { jsonResponse, tokenEndpointBody } from './jwt-fixture';

const COOKIE = JSON.stringify({ verifier: 'verifier-1', state: 'state-1' });
const ENV = { AUTH_BACKEND_URL: 'http://auth.test:3000', APP_PUBLIC_URL: 'https://med.example.by', OAUTH_CLIENT_ID: 'medcenter-web' };

function params(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

describe('buildState', () => {
  it('should append the encoded returnTo after the state', () => {
    expect(buildState('abc', '/appointments?x=1')).toBe('abc.%2Fappointments%3Fx%3D1');
  });

  it('should be the bare state when there is no returnTo', () => {
    expect(buildState('abc', null)).toBe('abc');
  });
});

describe('parseCallback', () => {
  it('should accept a code whose state matches the PKCE cookie and keep the returnTo', () => {
    const state = buildState('state-1', '/appointments');

    expect(parseCallback(params(`code=c1&state=${encodeURIComponent(state)}`), COOKIE)).toEqual({
      code: 'c1',
      verifier: 'verifier-1',
      returnTo: '/appointments',
    });
  });

  it('should return no returnTo when the state carries none', () => {
    expect(parseCallback(params('code=c1&state=state-1'), COOKIE)?.returnTo).toBeNull();
  });

  it.each([
    ['an absolute URL', 'https://evil.example.com'],
    ['a protocol-relative URL', '//evil.example.com'],
    ['a javascript: URL', 'javascript:alert(1)'],
  ])('should drop %s as returnTo (open-redirect denylist)', (_label, evil) => {
    const state = buildState('state-1', evil);

    expect(parseCallback(params(`code=c1&state=${encodeURIComponent(state)}`), COOKIE)?.returnTo).toBeNull();
  });

  it.each([
    ['the authorization server reported an error', 'error=access_denied&state=state-1'],
    ['there is no code', 'state=state-1'],
    ['the code is empty', 'code=&state=state-1'],
    ['there is no state', 'code=c1'],
    ['the state differs from the cookie', 'code=c1&state=other'],
    ['the state is empty before the separator', 'code=c1&state=.%2Fbooking'],
  ])('should reject the callback when %s (fail-closed PKCE)', (_label, query) => {
    expect(parseCallback(params(query), COOKIE)).toBeNull();
  });

  it.each([
    ['is missing', undefined],
    ['is not JSON', 'not-json'],
    ['has no verifier', JSON.stringify({ state: 'state-1' })],
    ['has an empty state', JSON.stringify({ verifier: 'v', state: '' })],
  ])('should reject the callback when the PKCE cookie %s', (_label, cookie) => {
    expect(parseCallback(params('code=c1&state=state-1'), cookie)).toBeNull();
  });
});

describe('exchangeAuthorizationCode', () => {
  const INPUT = { code: 'c1', verifier: 'verifier-1', returnTo: null };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should send the verifier and the PUBLIC redirect_uri, not the request origin', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse(tokenEndpointBody()));

    const tokens = await exchangeAuthorizationCode(INPUT, ENV);

    expect(tokens).toEqual({ accessToken: expect.any(String), refreshToken: 'refresh-next', expiresIn: 900 });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(String(init.body));
    expect(url).toBe('http://auth.test:3000/oauth/token');
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('redirect_uri')).toBe('https://med.example.by/api/auth/callback');
    expect(body.get('code_verifier')).toBe('verifier-1');
    expect(body.get('client_id')).toBe('medcenter-web');
  });

  it('should resolve null when auth-service rejects the code', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ error: 'invalid_grant' }, 400));

    await expect(exchangeAuthorizationCode(INPUT, ENV)).resolves.toBeNull();
  });

  it('should resolve null when auth-service is unreachable', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(exchangeAuthorizationCode(INPUT, ENV)).resolves.toBeNull();
  });

  it('should resolve null when the token body is malformed', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ access_token: 'a.b.c' }));

    await expect(exchangeAuthorizationCode(INPUT, ENV)).resolves.toBeNull();
  });
});
