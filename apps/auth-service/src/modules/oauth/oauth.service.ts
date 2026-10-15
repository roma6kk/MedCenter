import { Inject, Injectable } from '@nestjs/common';

import type { RegisteredClient } from './guards/client.guard';
import {
  IDENTITY_RESOLVER,
  isRole,
  restrictScopeToRole,
  toIdentityClaims,
  type IdentityClaims,
  type IdentityResolver,
} from './identity';
import { ACCESS_TOKEN_TTL_SECONDS, JwtService } from './jwt.service';
import { OAuthError } from './oauth-error';
import { PkceService } from './pkce.service';
import {
  AUTHORIZATION_CODE_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  TokenService,
  type StoredToken,
} from './token.service';

export interface AuthorizeParams {
  readonly client: RegisteredClient;
  readonly redirectUri: string;
  readonly scope: string;
  readonly state: string;
  readonly codeChallenge: string;
  readonly principal: {
    readonly userId: string;
    readonly role?: string;
    readonly patientRef?: string;
    readonly fhirUser?: string;
  };
}

export interface ExchangeCodeParams {
  readonly code: string;
  readonly clientId: string;
  readonly codeVerifier: string;
}

export interface RefreshParams {
  readonly refreshToken: string;
  readonly clientId: string;
}

/**
 * Revocation is authorized against the token's recorded owner (RFC 7009 §2.1):
 * the refresh token may only be revoked by the principal it was issued to. The
 * caller supplies the authenticated `userId` (from the Bearer access token) and,
 * when known, the `clientId`; the operation is a no-op unless they match the
 * stored token's owner.
 */
export interface RevokeParams {
  readonly refreshToken: string;
  readonly userId: string;
  readonly clientId?: string;
}

/** Shape mandated by API 2.1.3 (`access_token`, `expires_in`, `refresh_token`, …). */
export interface TokenResponse {
  readonly access_token: string;
  readonly token_type: 'Bearer';
  readonly expires_in: number;
  readonly refresh_token: string;
  readonly scope: string;
  /** SMART launch context: the bare Patient id (PATIENT tokens only). */
  readonly patient?: string;
}

/**
 * Scopes the client is allowed to request; unknown scopes are dropped (M5).
 * An empty request keeps the client's full grant — that is the "no scope
 * asked" case. When the client *does* ask but nothing it asked for was ever
 * granted, the authorize call must fail with `invalid_scope` (RFC 6749
 * §4.1.2.1) instead of minting a token with an empty scope.
 */
function narrowScope(requested: string, allowed: ReadonlyArray<string>): string {
  const requestedScopes = requested.split(' ').filter((scope) => scope.length > 0);
  if (requestedScopes.length === 0) {
    return allowed.join(' ');
  }
  const narrowed = requestedScopes.filter((scope) => allowed.includes(scope));
  if (narrowed.length === 0) {
    throw OAuthError.invalidScope('None of the requested scopes is granted to this client');
  }
  return narrowed.join(' ');
}

/**
 * A role never receives another role's SMART scopes (API §0 scope matrix):
 * the browser client asks for every scope at once, so the grant is narrowed to
 * the principal's role as well as to the client registration.
 */
function narrowScopeToPrincipal(scope: string, role: string | undefined): string {
  if (!isRole(role)) {
    return scope;
  }
  const narrowed = restrictScopeToRole(scope, role);
  if (narrowed.length === 0) {
    throw OAuthError.invalidScope('None of the requested scopes is allowed for this account');
  }
  return narrowed;
}

@Injectable()
export class OAuthService {
  constructor(
    private readonly pkce: PkceService,
    private readonly jwt: JwtService,
    private readonly tokens: TokenService,
    @Inject(IDENTITY_RESOLVER) private readonly identities: IdentityResolver,
  ) {}

  /** API 2.1.2 — issues a single-use authorization code and returns the redirect URL. */
  async authorize(params: AuthorizeParams): Promise<string> {
    const scope = narrowScopeToPrincipal(
      narrowScope(params.scope, params.client.scopes),
      params.principal.role,
    );
    const code = await this.tokens.issue({
      userId: params.principal.userId,
      clientId: params.client.clientId,
      scope,
      kind: 'code',
      ttlSeconds: AUTHORIZATION_CODE_TTL_SECONDS,
      codeChallenge: params.codeChallenge,
      ...(params.principal.role !== undefined ? { role: params.principal.role } : {}),
      ...(params.principal.patientRef !== undefined
        ? { patientRef: params.principal.patientRef }
        : {}),
      ...(params.principal.fhirUser !== undefined ? { fhirUser: params.principal.fhirUser } : {}),
    });
    const redirect = new URL(params.redirectUri);
    redirect.searchParams.set('code', code.jti);
    if (params.state.length > 0) {
      redirect.searchParams.set('state', params.state);
    }
    return redirect.toString();
  }

  /** API 2.1.3 — exchanges an authorization code (PKCE-verified) for a token pair. */
  async exchangeCode(params: ExchangeCodeParams): Promise<TokenResponse> {
    const stored = await this.tokens.consume(params.code, 'code');
    if (stored === null) {
      throw OAuthError.invalidGrant(
        'Authorization code is invalid, expired or already used',
      );
    }
    if (stored.clientId !== params.clientId) {
      throw OAuthError.invalidGrant('client_id does not match the authorization code');
    }
    if (!this.pkce.verify(stored.codeChallenge, params.codeVerifier)) {
      throw OAuthError.invalidGrant('PKCE verification failed');
    }
    return this.issuePair(stored);
  }

  /**
   * API 2.1.3 — rotates the refresh token: the presented one is consumed, never
   * reused.
   *
   * The denylist is consulted *before* the store lookup so a token that was
   * revoked or already rotated is rejected consistently. Per RFC 6749 §5.2 and
   * `specs/api-designer-spec.md` §2.1.3 the outcome is **400 `invalid_grant`**
   * for every unusable refresh token — the endpoint does not distinguish a
   * revoked `jti` from an unknown one (`TOKEN_REVOKED`/401 belongs to the guard
   * layer, on a Bearer access token).
   */
  async refresh(params: RefreshParams): Promise<TokenResponse> {
    if (await this.tokens.isDenied(params.refreshToken)) {
      throw OAuthError.invalidGrantRevoked();
    }
    const stored = await this.tokens.consume(params.refreshToken, 'refresh');
    if (stored === null) {
      throw OAuthError.invalidGrant('Refresh token is invalid or expired');
    }
    if (stored.clientId !== params.clientId) {
      throw OAuthError.invalidGrant('client_id does not match the refresh token');
    }
    return this.issuePair(stored);
  }

  /**
   * API 2.1.4 — revokes a refresh token so its `jti` lands in the denylist.
   *
   * RFC 7009 §2.1 requires that the server validate the token belongs to the
   * authenticated principal before acting on it, so the stored token's
   * `userId` (and, when supplied, its `clientId`) is compared with the caller's
   * before anything is denied. A token that is unknown, already consumed/denied,
   * or owned by someone else is a **no-op** — never a new denial — so the
   * endpoint cannot be used to enumerate or to revoke another principal's token.
   * The method resolves to `true` only when the caller owned the token and it was
   * denied.
   *
   * Because the access token issued alongside it carries this `jti` as its
   * `sid`, the revocation also ends the session at the guard layer: the Bearer
   * token that authorized this very call stops being accepted (`TOKEN_REVOKED`).
   */
  async revoke(params: RevokeParams): Promise<boolean> {
    const stored = await this.tokens.find(params.refreshToken);
    if (stored === null || stored.kind !== 'refresh') {
      return false;
    }
    if (stored.userId !== params.userId) {
      return false;
    }
    if (params.clientId !== undefined && stored.clientId !== params.clientId) {
      return false;
    }
    await this.tokens.revoke(params.refreshToken);
    return true;
  }

  /**
   * The refresh token is minted **first**: its `jti` becomes the `sid` of the
   * access token, which is what lets `JwtAuthGuard` treat revoking the refresh
   * token (RFC 7009 / logout) as revoking the pair.
   *
   * Role, `patient` and `fhirUser` are resolved from the `auth` schema on every
   * grant — never copied from the stored token — so a deactivated account
   * cannot refresh, and a role change or a new `ExternalLink` applies at the
   * next refresh. The scope is re-narrowed to the current role for the same
   * reason.
   */
  private async issuePair(stored: StoredToken): Promise<TokenResponse> {
    const { scope, claims } = await this.resolveGrant(stored);
    const refresh = await this.tokens.issue({
      userId: stored.userId,
      clientId: stored.clientId,
      scope,
      kind: 'refresh',
      ttlSeconds: REFRESH_TOKEN_TTL_SECONDS,
      role: claims.role,
      ...(claims.patient !== undefined ? { patientRef: claims.patient } : {}),
      ...(claims.fhirUser !== undefined ? { fhirUser: claims.fhirUser } : {}),
    });
    const accessToken = this.jwt.signAccessToken({
      sub: stored.userId,
      scope,
      role: claims.role,
      sid: refresh.jti,
      ...(claims.patient !== undefined ? { patientRef: claims.patient } : {}),
      ...(claims.fhirUser !== undefined ? { fhirUser: claims.fhirUser } : {}),
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refresh.jti,
      scope,
      ...(claims.patient !== undefined ? { patient: claims.patient } : {}),
    };
  }

  private async resolveGrant(stored: StoredToken): Promise<{ readonly scope: string; readonly claims: IdentityClaims }> {
    const identity = await this.identities.resolve(stored.userId);
    if (identity === null) {
      throw OAuthError.invalidGrant('The account is inactive or no longer exists');
    }
    const scope = restrictScopeToRole(stored.scope, identity.role);
    if (scope.length === 0) {
      throw OAuthError.invalidGrant('The granted scope is not allowed for the current role');
    }
    return { scope, claims: toIdentityClaims(identity) };
  }
}
