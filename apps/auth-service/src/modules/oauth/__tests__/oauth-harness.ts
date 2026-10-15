import { JwtService } from '../jwt.service';
import { OAuthError } from '../oauth-error';
import { OAuthService } from '../oauth.service';
import { PkceService } from '../pkce.service';
import { InMemoryTokenDenylist, InMemoryTokenStore, TokenService } from '../token.service';
import { StubIdentityResolver } from './identity-stub';
import { createTestKeys } from './test-keys';

export interface OAuthHarness {
  readonly service: OAuthService;
  readonly pkce: PkceService;
  readonly tokens: TokenService;
  readonly identities: StubIdentityResolver;
}

/** A fully in-memory `OAuthService` with a controllable identity lookup. */
export function createOAuthHarness(): OAuthHarness {
  const tokens = new TokenService(new InMemoryTokenStore(), new InMemoryTokenDenylist());
  const pkce = new PkceService();
  const identities = new StubIdentityResolver();
  const service = new OAuthService(pkce, new JwtService(createTestKeys()), tokens, identities);
  return { service, pkce, tokens, identities };
}

export function decodeClaims(accessToken: string): Record<string, unknown> {
  return JSON.parse(
    Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString('utf8'),
  ) as Record<string, unknown>;
}

export function readRedirectParam(redirectUrl: string, key: string): string {
  return new URL(redirectUrl).searchParams.get(key) ?? '';
}

export async function captureOAuthError(promise: Promise<unknown>): Promise<OAuthError> {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(OAuthError);
  return error as OAuthError;
}
