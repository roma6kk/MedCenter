import { Injectable } from '@nestjs/common';

import type { RegisteredClient } from './guards/client.guard';
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
  readonly patient?: string;
}

/** Scopes the client is allowed to request; unknown scopes are dropped. */
function narrowScope(requested: string, allowed: ReadonlyArray<string>): string {
  const requestedScopes = requested.split(' ').filter((scope) => scope.length > 0);
  if (requestedScopes.length === 0) {
    return allowed.join(' ');
  }
  return requestedScopes.filter((scope) => allowed.includes(scope)).join(' ');
}

@Injectable()
export class OAuthService {
  constructor(
    private readonly pkce: PkceService,
    private readonly jwt: JwtService,
    private readonly tokens: TokenService,
  ) {}

  /** API 2.1.2 — issues a single-use authorization code and returns the redirect URL. */
  async authorize(params: AuthorizeParams): Promise<string> {
    const scope = narrowScope(params.scope, params.client.scopes);
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
   */
  private async issuePair(stored: StoredToken): Promise<TokenResponse> {
    const role = stored.role ?? 'PATIENT';
    const refresh = await this.tokens.issue({
      userId: stored.userId,
      clientId: stored.clientId,
      scope: stored.scope,
      kind: 'refresh',
      ttlSeconds: REFRESH_TOKEN_TTL_SECONDS,
      ...(stored.role !== undefined ? { role: stored.role } : {}),
      ...(stored.patientRef !== undefined ? { patientRef: stored.patientRef } : {}),
      ...(stored.fhirUser !== undefined ? { fhirUser: stored.fhirUser } : {}),
    });
    const accessToken = this.jwt.signAccessToken({
      sub: stored.userId,
      scope: stored.scope,
      role,
      sid: refresh.jti,
      ...(stored.patientRef !== undefined ? { patientRef: stored.patientRef } : {}),
      ...(stored.fhirUser !== undefined ? { fhirUser: stored.fhirUser } : {}),
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refresh.jti,
      scope: stored.scope,
      ...(stored.patientRef !== undefined ? { patient: stored.patientRef } : {}),
    };
  }
}
