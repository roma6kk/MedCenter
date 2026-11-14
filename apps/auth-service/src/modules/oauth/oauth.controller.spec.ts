import type { AuditService } from '../audit/audit.service';
import { JwtService } from './jwt.service';
import { JwksService } from './jwks.service';
import { OAuthController, readFhirBaseUrl } from './oauth.controller';
import { OAuthService } from './oauth.service';
import { PkceService } from './pkce.service';
import { OAuthError } from './oauth-error';
import { InMemoryTokenDenylist, InMemoryTokenStore, TokenService } from './token.service';
import { StubIdentityResolver } from './__tests__/identity-stub';
import { createTestKeys } from './__tests__/test-keys';

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
  const oauth = new OAuthService(pkce, new JwtService(keys), tokens, new StubIdentityResolver(), { recordAuthEvent: jest.fn() } as unknown as AuditService);

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

describe('OAuthController', () => {
  const savedFhirBaseUrl = process.env['FHIR_BASE_URL'];

  afterEach(() => {
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

  it('should record activity for the session named by the access token', async () => {
    const { controller, tokens } = createHarness();
    const issued = await tokens.issue({ userId: 'u1', clientId: 'medcenter-web', scope: 'launch', kind: 'refresh', ttlSeconds: 60, lastActivityAt: Date.now() - 60_000 });

    const request = { user: { sub: 'u1', sid: issued.jti } } as unknown as RevokeRequest;

    await expect(controller.activity(request)).resolves.toEqual({ recorded: true });
    expect((await tokens.find(issued.jti))?.lastActivityAt).toBeGreaterThan(Date.now() - 30_000);
  });

  it('should not record activity for a token without a session id', async () => {
    const { controller } = createHarness();

    await expect(controller.activity({ user: { sub: 'u1' } } as unknown as RevokeRequest)).resolves.toEqual({ recorded: false });
  });
});
