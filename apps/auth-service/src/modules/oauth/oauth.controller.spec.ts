import { JwtService } from './jwt.service';
import { JwksService } from './jwks.service';
import { OAuthController, readFhirBaseUrl } from './oauth.controller';
import { OAuthService } from './oauth.service';
import { PkceService } from './pkce.service';
import { OAuthError } from './oauth-error';
import { InMemoryTokenDenylist, InMemoryTokenStore, TokenService } from './token.service';
import { TEST_REDIRECT_URI, createTestClient, createTestKeys } from './__tests__/test-keys';

type AuthorizeArgs = Parameters<OAuthController['authorize']>;
type TokenArg = Parameters<OAuthController['token']>[0];
type RevokeArg = Parameters<OAuthController['revoke']>[0];
type RevokeRequest = Parameters<OAuthController['revoke']>[1];

function revokeRequest(userId: string): RevokeRequest {
  return { user: { sub: userId } } as unknown as RevokeRequest;
}

interface ControllerHarness {
  readonly controller: OAuthController;
  readonly oauth: OAuthService;
  readonly pkce: PkceService;
  readonly tokens: TokenService;
}

function createHarness(): ControllerHarness {
  const keys = createTestKeys();
  const tokens = new TokenService(new InMemoryTokenStore(), new InMemoryTokenDenylist());
  const pkce = new PkceService();
  const oauth = new OAuthService(pkce, new JwtService(keys), tokens);

  return {
    controller: new OAuthController(oauth, new JwksService(keys), keys),
    oauth,
    pkce,
    tokens,
  };
}

async function captureOAuthError(promise: Promise<unknown>): Promise<OAuthError> {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(OAuthError);
  return error as OAuthError;
}

function makeRedirectSpy(): { redirect: jest.Mock; response: AuthorizeArgs[1] } {
  const redirect = jest.fn();
  return { redirect, response: { redirect } as unknown as AuthorizeArgs[1] };
}

describe('OAuthController', () => {
  const savedFhirBaseUrl = process.env['FHIR_BASE_URL'];

  afterEach(() => {
    // N5: the first test in this suite used to mutate `process.env` in place
    // without restoring it, leaking into every suite sharing the Jest worker.
    if (savedFhirBaseUrl === undefined) {
      delete process.env['FHIR_BASE_URL'];
    } else {
      process.env['FHIR_BASE_URL'] = savedFhirBaseUrl;
    }
  });

  it('should advertise the SMART endpoints and S256 only', () => {
    process.env['FHIR_BASE_URL'] = 'http://hapi:8080/fhir';
    const { controller } = createHarness();

    const config = controller.smartConfiguration();

    expect(config.token_endpoint.endsWith('/oauth/token')).toBe(true);
    expect(config.code_challenge_methods_supported).toEqual(['S256']);
    expect(config.response_types_supported).toEqual(['code']);
    expect(config.scopes_supported).toContain('patient/*.read');
    expect(config.fhir_base).toBe('http://hapi:8080/fhir');
  });

  it('should fall back to an empty fhir_base only when the value is absent or not a url', () => {
    expect(readFhirBaseUrl({})).toBe('');
    expect(readFhirBaseUrl({ FHIR_BASE_URL: 'not-a-url' })).toBe('');
    expect(readFhirBaseUrl({ FHIR_BASE_URL: 'http://hapi:8080/fhir' })).toBe(
      'http://hapi:8080/fhir',
    );
  });

  it('should advertise how a client authenticates at the token endpoint and which grants exist', () => {
    const { controller } = createHarness();

    const config = controller.smartConfiguration();

    // A PKCE-only public client authenticates with `none`; the confidential client
    // posts its secret in the request body, which is what `TokenClientGuard`
    // accepts. Clients discover both through this document.
    expect(config.token_endpoint_auth_methods_supported).toEqual(['client_secret_post', 'none']);
    expect(config.grant_types_supported).toEqual(['authorization_code', 'refresh_token']);
  });

  it('should publish an RS256 signing key in the JWKS document', () => {
    const { controller } = createHarness();

    const jwks = controller.jwksDocument();

    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]).toMatchObject({ kty: 'RSA', alg: 'RS256', use: 'sig', kid: 'auth-test' });
    expect(jwks.keys[0]).not.toHaveProperty('d');
  });

  it('should reject an authorization_code grant that omits the verifier', async () => {
    const { controller } = createHarness();

    const error = await captureOAuthError(
      controller.token({
        grant_type: 'authorization_code',
        code: 'c',
        client_id: 'medcenter-web',
      } as TokenArg),
    );

    expect(error.getResponse()).toMatchObject({ error: 'invalid_request' });
  });

  it('should reject an unsupported grant_type', async () => {
    const { controller } = createHarness();

    const error = await captureOAuthError(
      controller.token({ grant_type: 'client_credentials' } as unknown as TokenArg),
    );

    expect(error.getResponse()).toMatchObject({ error: 'unsupported_grant_type' });
  });

  it('should reject a revoke call without a refresh token', async () => {
    const { controller } = createHarness();

    const error = await captureOAuthError(controller.revoke({} as RevokeArg, revokeRequest('u1')));

    expect(error.getResponse()).toMatchObject({ error: 'invalid_request' });
  });

  it('should acknowledge a revoke call for a refresh token the caller owns', async () => {
    const { controller, tokens } = createHarness();
    const issued = await tokens.issue({
      userId: 'u1',
      clientId: 'medcenter-web',
      scope: 'launch',
      kind: 'refresh',
      ttlSeconds: 60,
    });

    await expect(
      controller.revoke({ refreshToken: issued.jti }, revokeRequest('u1')),
    ).resolves.toEqual({ revoked: true });
    await expect(tokens.isDenied(issued.jti)).resolves.toBe(true);
  });

  it('should not revoke a refresh token owned by another principal', async () => {
    const { controller, tokens } = createHarness();
    const issued = await tokens.issue({
      userId: 'owner-1',
      clientId: 'medcenter-web',
      scope: 'launch',
      kind: 'refresh',
      ttlSeconds: 60,
    });

    await expect(
      controller.revoke({ refreshToken: issued.jti }, revokeRequest('intruder-2')),
    ).resolves.toEqual({ revoked: false });
    await expect(tokens.isDenied(issued.jti)).resolves.toBe(false);
  });

  it('should let an infrastructure failure reach the global filter instead of reporting access_denied', async () => {
    const { controller, oauth, pkce } = createHarness();
    const { redirect, response } = makeRedirectSpy();
    const { codeChallenge } = pkce.generate();
    jest.spyOn(oauth, 'authorize').mockRejectedValue(new Error('token store unreachable'));
    const request = {
      query: {
        client_id: 'medcenter-web',
        redirect_uri: TEST_REDIRECT_URI,
        state: 'st',
        code_challenge: codeChallenge,
      },
      client: createTestClient(),
      user: { sub: 'u1', role: 'PATIENT' },
    } as unknown as AuthorizeArgs[0];

    // An outage is not a consent decision: it must not be reported to the user as
    // `access_denied` and must not be swallowed either (M4).
    await expect(controller.authorize(request, response)).rejects.toThrow(
      'token store unreachable',
    );
    expect(redirect).not.toHaveBeenCalled();
  });

  it('should bounce a token-endpoint-only failure to the client as access_denied', async () => {
    // RFC 6749 §4.1.2.1 does not allow `invalid_grant` on the authorize redirect.
    const { controller, oauth, pkce } = createHarness();
    const { redirect, response } = makeRedirectSpy();
    const { codeChallenge } = pkce.generate();
    jest.spyOn(oauth, 'authorize').mockRejectedValue(OAuthError.invalidGrant('not allowed here'));
    const request = {
      query: {
        client_id: 'medcenter-web',
        redirect_uri: TEST_REDIRECT_URI,
        state: 'st',
        code_challenge: codeChallenge,
      },
      client: createTestClient(),
      user: { sub: 'u1', role: 'PATIENT' },
    } as unknown as AuthorizeArgs[0];

    await controller.authorize(request, response);

    expect(redirect).toHaveBeenCalledTimes(1);
    const target = new URL(String(redirect.mock.calls[0]?.[0]));
    expect(target.searchParams.get('error')).toBe('access_denied');
    expect(target.searchParams.get('state')).toBe('st');
  });

  it('should forward invalid_request to the client instead of access_denied', async () => {
    const { controller, oauth, pkce } = createHarness();
    const { redirect, response } = makeRedirectSpy();
    const { codeChallenge } = pkce.generate();
    jest
      .spyOn(oauth, 'authorize')
      .mockRejectedValue(OAuthError.invalidRequest('redirect_uri was rejected'));
    const request = {
      query: {
        client_id: 'medcenter-web',
        redirect_uri: TEST_REDIRECT_URI,
        state: 'st',
        code_challenge: codeChallenge,
      },
      client: createTestClient(),
      user: { sub: 'u1', role: 'PATIENT' },
    } as unknown as AuthorizeArgs[0];

    await controller.authorize(request, response);

    const target = new URL(String(redirect.mock.calls[0]?.[0]));
    expect(target.searchParams.get('error')).toBe('invalid_request');
    expect(target.searchParams.get('state')).toBe('st');
  });

  it('should redirect with invalid_scope when no requested scope is granted to the client', async () => {
    // M5: the real service raises `invalid_scope`; the SMART client must see it
    // on the redirect (RFC 6749 §4.1.2.1), not a generic `access_denied`.
    const { controller, pkce } = createHarness();
    const { redirect, response } = makeRedirectSpy();
    const { codeChallenge } = pkce.generate();
    const request = {
      query: {
        client_id: 'medcenter-web',
        redirect_uri: TEST_REDIRECT_URI,
        state: 'st',
        scope: 'system/*.write',
        code_challenge: codeChallenge,
      },
      client: createTestClient(),
      user: { sub: 'u1', role: 'PATIENT' },
    } as unknown as AuthorizeArgs[0];

    await controller.authorize(request, response);

    expect(redirect).toHaveBeenCalledTimes(1);
    const target = new URL(String(redirect.mock.calls[0]?.[0]));
    expect(target.searchParams.get('error')).toBe('invalid_scope');
    expect(target.searchParams.get('code')).toBeNull();
    expect(target.searchParams.get('state')).toBe('st');
  });

  it('should bounce to the client with access_denied when no principal is present', async () => {
    const { controller } = createHarness();
    const { redirect, response } = makeRedirectSpy();
    const request = {
      query: { client_id: 'medcenter-web', redirect_uri: TEST_REDIRECT_URI, state: 'st' },
      client: createTestClient(),
    } as unknown as AuthorizeArgs[0];

    await controller.authorize(request, response);

    expect(redirect).toHaveBeenCalledTimes(1);
    const target = new URL(String(redirect.mock.calls[0]?.[0]));
    expect(target.searchParams.get('error')).toBe('access_denied');
    expect(target.searchParams.get('state')).toBe('st');
  });

  it('should redirect with a code when the principal and PKCE challenge are valid', async () => {
    const { controller, pkce } = createHarness();
    const { redirect, response } = makeRedirectSpy();
    const { codeChallenge } = pkce.generate();
    const request = {
      query: {
        client_id: 'medcenter-web',
        redirect_uri: TEST_REDIRECT_URI,
        state: 'st',
        scope: 'patient/*.read',
        code_challenge: codeChallenge,
      },
      client: createTestClient(),
      user: { sub: 'u1', role: 'PATIENT', patient: 'Patient/1' },
    } as unknown as AuthorizeArgs[0];

    await controller.authorize(request, response);

    const target = new URL(String(redirect.mock.calls[0]?.[0]));
    expect(target.searchParams.get('state')).toBe('st');
    expect(target.searchParams.get('code')).toBeTruthy();
  });
});
