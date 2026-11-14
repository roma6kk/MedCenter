import { Inject, Injectable } from '@nestjs/common';

import { readSessionIdleTimeoutMs } from '../../config/auth-env';
import { AuditService } from '../audit/audit.service';

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

export const SESSION_IDLE_TIMEOUT_MS = 'SESSION_IDLE_TIMEOUT_MS';

interface AuthorizeParams {
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

interface ExchangeCodeParams {
  readonly code: string;
  readonly clientId: string;
  readonly codeVerifier: string;
}

interface RefreshParams {
  readonly refreshToken: string;
  readonly clientId: string;
}

interface RevokeParams {
  readonly refreshToken: string;
  readonly userId: string;
  readonly clientId?: string;
}

export interface TokenResponse {
  readonly access_token: string;
  readonly token_type: 'Bearer';
  readonly expires_in: number;
  readonly refresh_token: string;
  readonly scope: string;
  readonly patient?: string;
}

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

interface ResolvedGrant {
  readonly scope: string;
  readonly claims: IdentityClaims;
}

@Injectable()
export class OAuthService {
  constructor(
    private readonly pkce: PkceService,
    private readonly jwt: JwtService,
    private readonly tokens: TokenService,
    @Inject(IDENTITY_RESOLVER) private readonly identities: IdentityResolver,
    private readonly audit: AuditService,
    @Inject(SESSION_IDLE_TIMEOUT_MS) private readonly idleTimeoutMs: number = readSessionIdleTimeoutMs(),
  ) {}

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

  // The code is only looked at until the grant is resolved: a database hiccup must not burn a usable code. consume is the single atomic spend.
  async exchangeCode(params: ExchangeCodeParams): Promise<TokenResponse> {
    const found = await this.tokens.find(params.code);
    if (found === null || found.kind !== 'code' || found.expiresAt.getTime() <= Date.now()) {
      throw OAuthError.invalidGrant(
        'Authorization code is invalid, expired or already used',
      );
    }
    if (found.clientId !== params.clientId) {
      throw OAuthError.invalidGrant('client_id does not match the authorization code');
    }
    if (!this.pkce.verify(found.codeChallenge, params.codeVerifier)) {
      throw OAuthError.invalidGrant('PKCE verification failed');
    }
    const grant = await this.resolveGrant(found);
    const stored = await this.tokens.consume(params.code, 'code');
    if (stored === null) {
      throw OAuthError.invalidGrant(
        'Authorization code is invalid, expired or already used',
      );
    }
    return this.issuePair(stored, grant);
  }

  async refresh(params: RefreshParams): Promise<TokenResponse> {
    if (await this.tokens.isDenied(params.refreshToken)) {
      throw OAuthError.invalidGrantRevoked();
    }
    // Look first, spend last: a database failure answers 5xx and the client can retry with the same refresh token.
    const found = await this.tokens.find(params.refreshToken);
    if (found === null || found.kind !== 'refresh' || found.expiresAt.getTime() <= Date.now()) {
      throw OAuthError.invalidGrant('Refresh token is invalid or expired');
    }
    if (found.clientId !== params.clientId) {
      throw OAuthError.invalidGrant('client_id does not match the refresh token');
    }
    if (this.isIdle(found)) {
      await this.tokens.revoke(found.jti);
      void this.audit.recordAuthEvent({ kind: 'session-idle', userId: found.userId });
      throw OAuthError.invalidGrant('Session ended after a period of inactivity');
    }
    const grant = await this.resolveGrant(found);
    const stored = await this.tokens.consume(params.refreshToken, 'refresh');
    if (stored === null) {
      throw OAuthError.invalidGrant('Refresh token is invalid or expired');
    }
    return this.issuePair(stored, grant);
  }

  // Only the user-driven activity ping calls this: a refresh never counts, or background polling would keep an abandoned session alive.
  async recordActivity(sessionId: string, userId: string): Promise<boolean> {
    const found = await this.tokens.find(sessionId);
    if (found === null || found.kind !== 'refresh' || found.userId !== userId || this.isIdle(found)) {
      return false;
    }
    await this.tokens.touch(sessionId);
    return true;
  }

  async revoke(params: RevokeParams): Promise<boolean> {
    const stored = await this.tokens.find(params.refreshToken);
    if (
      stored === null ||
      stored.kind !== 'refresh' ||
      stored.userId !== params.userId ||
      (params.clientId !== undefined && stored.clientId !== params.clientId)
    ) {
      return false;
    }
    await this.tokens.revoke(params.refreshToken);
    void this.audit.recordAuthEvent({ kind: 'logout', userId: stored.userId });
    return true;
  }

  // Refresh token first: its jti is the access token's sid. Role and identity are re-resolved on every grant, so a deactivated account cannot refresh.
  private async issuePair(stored: StoredToken, grant: ResolvedGrant): Promise<TokenResponse> {
    const { scope, claims } = grant;
    const refresh = await this.tokens.issue({
      userId: stored.userId,
      clientId: stored.clientId,
      scope,
      kind: 'refresh',
      ttlSeconds: REFRESH_TOKEN_TTL_SECONDS,
      ...(stored.lastActivityAt !== undefined ? { lastActivityAt: stored.lastActivityAt } : {}),
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

  private isIdle(token: StoredToken): boolean {
    return token.lastActivityAt !== undefined && Date.now() - token.lastActivityAt > this.idleTimeoutMs;
  }

  private async resolveGrant(stored: StoredToken): Promise<ResolvedGrant> {
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
