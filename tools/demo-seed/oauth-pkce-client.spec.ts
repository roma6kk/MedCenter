import type { FetchLike } from '../shared/fhir-http';
import { FakeAuthServer, type FakeAuthOptions } from './fake-auth-server';
import {
  buildAuthorizeUrl,
  createPkcePair,
  obtainAccessToken,
  OAuthFlowError,
  readAuthorizationCode,
  type OAuthConfig,
} from './oauth-pkce-client';

const REDIRECT_URI = 'http://localhost:3000/api/auth/callback';
const CONFIG: OAuthConfig = {
  authBaseUrl: 'http://auth.test:8081',
  clientId: 'medcenter-web',
  redirectUri: REDIRECT_URI,
  scope: 'launch user/*.read user/*.write',
};
const ADMIN = { email: 'admin@medcenter.test', password: 'Adm1n!Passw0rd' };

function authServer(overrides: Partial<FakeAuthOptions> = {}): FakeAuthServer {
  return new FakeAuthServer({
    clientId: CONFIG.clientId,
    redirectUri: REDIRECT_URI,
    accounts: { [ADMIN.email]: ADMIN.password },
    ...overrides,
  });
}

describe('createPkcePair', () => {
  it('should derive the S256 challenge of the RFC 7636 appendix B example', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

    const pair = createPkcePair(() => Buffer.from(verifier, 'base64url'));

    expect(pair).toEqual({ verifier, challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM' });
  });

  it('should generate a fresh 43-character verifier each time', () => {
    const [first, second] = [createPkcePair(), createPkcePair()];

    expect(first.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.verifier).not.toBe(second.verifier);
  });
});

describe('buildAuthorizeUrl', () => {
  it('should carry the PKCE challenge, the S256 method and the state of the request', () => {
    const url = new URL(buildAuthorizeUrl(CONFIG, { verifier: 'v', challenge: 'c' }, 'st'));

    expect(url.origin + url.pathname).toBe('http://auth.test:8081/oauth/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'medcenter-web',
      redirect_uri: REDIRECT_URI,
      scope: 'launch user/*.read user/*.write',
      state: 'st',
      code_challenge: 'c',
      code_challenge_method: 'S256',
    });
  });
});

describe('readAuthorizationCode', () => {
  const read = (location: string): string => readAuthorizationCode(location, REDIRECT_URI, 'st');

  it('should return the code of a redirect to the redirect_uri', () => {
    expect(read(`${REDIRECT_URI}?code=abc&state=st`)).toBe('abc');
  });

  it('should fail with the server error when the authorization server answers error=', () => {
    expect(() => read(`${REDIRECT_URI}?error=invalid_scope&state=st`)).toThrow('error=invalid_scope');
  });

  it('should fail when the redirect leaves the registered redirect_uri', () => {
    expect(() => read('http://evil.test/cb?code=abc&state=st')).toThrow(/not to the redirect_uri/);
  });

  it('should fail on a state mismatch, which is how a forged redirect shows', () => {
    expect(() => read(`${REDIRECT_URI}?code=abc&state=other`)).toThrow('state does not match');
  });

  it('should fail when the redirect carries no code', () => {
    expect(() => read(`${REDIRECT_URI}?state=st`)).toThrow('no authorization code');
  });
});

describe('obtainAccessToken', () => {
  it('should run authorize, login, resume and token and return the access token', async () => {
    const server = authServer();

    const token = await obtainAccessToken(CONFIG, ADMIN, server.fetch);

    expect(token).toBe(`jwt.for.${ADMIN.email}`);
    expect(server.requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      'GET /oauth/authorize',
      'POST /oauth/login',
      'GET /oauth/authorize',
      'POST /oauth/token',
    ]);
  });

  it('should submit exactly the four form fields together with the CSRF cookie of the login page', async () => {
    const server = authServer();

    await obtainAccessToken(CONFIG, ADMIN, server.fetch);

    const login = server.requests[1];
    expect([...(login?.body?.keys() ?? [])].sort()).toEqual(['authorize_query', 'csrf', 'email', 'password']);
    expect(login?.cookie).toMatch(/^mc_as_csrf=[A-Za-z0-9_-]+$/);
  });

  it('should resume the authorization with the single-use session cookie and without the CSRF cookie', async () => {
    const server = authServer();

    await obtainAccessToken(CONFIG, ADMIN, server.fetch);

    expect(server.requests[2]?.cookie).toMatch(/^mc_as_session=[0-9a-f-]+$/);
  });

  it('should prove possession of the PKCE verifier at the token endpoint', async () => {
    const server = authServer();

    await obtainAccessToken(CONFIG, ADMIN, server.fetch);

    const token = server.requests[3]?.body;
    expect(token?.get('grant_type')).toBe('authorization_code');
    expect(token?.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(token?.get('client_id')).toBe('medcenter-web');
  });

  it('should fail with a clear message and without echoing the password when the credentials are wrong', async () => {
    const failure = await obtainAccessToken(CONFIG, { ...ADMIN, password: 'Wr0ng!Passw0rd' }, authServer().fetch).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(OAuthFlowError);
    expect(String((failure as Error).message)).toContain('credentials rejected');
    expect(String((failure as Error).message)).not.toContain('Wr0ng');
    expect(String((failure as Error).message)).not.toContain(ADMIN.email);
  });

  it('should report a stale login form when the CSRF check fails', async () => {
    const stale = authServer({ loginStatus: 403 });

    await expect(obtainAccessToken(CONFIG, ADMIN, stale.fetch)).rejects.toThrow('stale (CSRF check failed)');
  });

  it('should report the login rate limit when the server answers 429', async () => {
    const limited = authServer({ loginStatus: 429 });

    await expect(obtainAccessToken(CONFIG, ADMIN, limited.fetch)).rejects.toThrow('rate limit reached');
  });

  it('should fail when the client is unknown to the authorization server', async () => {
    const server = authServer({ clientId: 'someone-else' });

    await expect(obtainAccessToken(CONFIG, ADMIN, server.fetch)).rejects.toThrow(/expected the login page, got HTTP 401.*invalid_client/);
  });

  it('should fail when the final redirect does not go to the registered redirect_uri', async () => {
    const hijacked = authServer({ redirectOverride: 'http://evil.test/callback' });

    await expect(obtainAccessToken(CONFIG, ADMIN, hijacked.fetch)).rejects.toThrow(/not to the redirect_uri/);
  });

  it('should fail with the OAuth error when the token endpoint refuses the code', async () => {
    const server = authServer();
    const refusing: FetchLike = async (url, init) =>
      new URL(url).pathname === '/oauth/token'
        ? new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })
        : server.fetch(url, init);

    await expect(obtainAccessToken(CONFIG, ADMIN, refusing)).rejects.toThrow(/token step failed: HTTP 400.*invalid_grant/);
  });

  it('should refuse to send the login cookies to another origin when the form posts elsewhere', async () => {
    const server = authServer();
    const redirecting: FetchLike = async (url, init) => {
      const response = await server.fetch(url, init);
      if (new URL(url).pathname !== '/oauth/authorize' || response.status !== 200) {
        return response;
      }
      const page = (await response.text()).replace('action="/oauth/login"', 'action="http://evil.test/oauth/login"');
      return new Response(page, { status: 200, headers: response.headers });
    };

    await expect(obtainAccessToken(CONFIG, ADMIN, redirecting)).rejects.toThrow(/it is not the auth origin/);
    expect(server.requests.map((request) => request.method)).toEqual(['GET']);
  });

  it('should fail when the token response has no access token', async () => {
    const server = authServer();
    const empty: FetchLike = async (url, init) =>
      new URL(url).pathname === '/oauth/token' ? new Response('{}', { status: 200 }) : server.fetch(url, init);

    await expect(obtainAccessToken(CONFIG, ADMIN, empty)).rejects.toThrow('no access_token');
  });
});
