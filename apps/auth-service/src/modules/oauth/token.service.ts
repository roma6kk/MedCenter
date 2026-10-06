import { Inject, Injectable } from '@nestjs/common';
import type { TokenRevocationChecker } from '@medcenter/common';
import { randomUUID } from 'node:crypto';

import { ACCESS_TOKEN_TTL_SECONDS } from './jwt.service';

export type TokenKind = 'code' | 'refresh';

/** Authorization codes are short-lived; refresh tokens live 14 days (API 2.1.3). */
export const AUTHORIZATION_CODE_TTL_SECONDS = 300;
export const REFRESH_TOKEN_TTL_SECONDS = 14 * 24 * 60 * 60;

/**
 * The denylist answers two different questions and they must never be conflated:
 *
 * - `reuse:` — a token was **consumed** (code exchange or refresh rotation), so a
 *   replay has to fail. This is reuse detection and it belongs to the token
 *   endpoint (`invalid_grant`), not to the guard stack.
 * - `session:` — a token was **revoked** (RFC 7009 / logout), so the session is
 *   over and the paired access token must stop being accepted by
 *   `JwtAuthGuard` (`TOKEN_REVOKED`).
 *
 * Rotation therefore writes only `reuse:` — a proactive refresh must not
 * invalidate the access token the client is still using, or every rotation would
 * log its own caller out.
 */
const REUSE_PREFIX = 'reuse:';
const SESSION_PREFIX = 'session:';

export interface StoredToken {
  readonly jti: string;
  readonly userId: string;
  readonly clientId: string;
  readonly kind: TokenKind;
  readonly scope: string;
  /** S256 challenge for `code` rows; empty for `refresh` rows. */
  readonly codeChallenge: string;
  readonly expiresAt: Date;
  readonly role?: string;
  readonly patientRef?: string;
  readonly fhirUser?: string;
}

export interface TokenStore {
  save(token: StoredToken): Promise<void>;
  find(jti: string): Promise<StoredToken | null>;
  delete(jti: string): Promise<void>;
}

export interface TokenDenylist {
  add(jti: string, ttlSeconds: number): Promise<void>;
  has(jti: string): Promise<boolean>;
}

export const TOKEN_STORE = 'TOKEN_STORE';
export const TOKEN_DENYLIST = 'TOKEN_DENYLIST';

/**
 * Dev/test implementations. Production wiring (a TypeORM-backed store over the
 * `auth.oauth_token` table and a Redis-backed denylist) is the persistence task
 * that follows; both sit behind these two interfaces so the swap is a provider
 * change only.
 */
export class InMemoryTokenStore implements TokenStore {
  private readonly tokens = new Map<string, StoredToken>();

  async save(token: StoredToken): Promise<void> {
    this.tokens.set(token.jti, token);
  }

  async find(jti: string): Promise<StoredToken | null> {
    return this.tokens.get(jti) ?? null;
  }

  async delete(jti: string): Promise<void> {
    this.tokens.delete(jti);
  }
}

export class InMemoryTokenDenylist implements TokenDenylist {
  private readonly denied = new Map<string, number>();

  async add(jti: string, ttlSeconds: number): Promise<void> {
    this.denied.set(jti, Date.now() + ttlSeconds * 1000);
  }

  async has(jti: string): Promise<boolean> {
    const expiresAt = this.denied.get(jti);
    if (expiresAt === undefined) {
      return false;
    }
    if (expiresAt <= Date.now()) {
      this.denied.delete(jti);
      return false;
    }
    return true;
  }
}

export interface IssueTokenParams {
  readonly userId: string;
  readonly clientId: string;
  readonly scope: string;
  readonly kind: TokenKind;
  readonly ttlSeconds: number;
  readonly codeChallenge?: string;
  readonly role?: string;
  readonly patientRef?: string;
  readonly fhirUser?: string;
}

/**
 * Owns both denylist namespaces (see `REUSE_PREFIX` / `SESSION_PREFIX`) and is
 * the issuer-side implementation of the guard layer's
 * `TokenRevocationChecker`: `auth-service` binds `TOKEN_REVOCATION` to this
 * service so `JwtAuthGuard` in every BFF reads the same revocation state.
 */
@Injectable()
export class TokenService implements TokenRevocationChecker {
  constructor(
    @Inject(TOKEN_STORE) private readonly store: TokenStore,
    @Inject(TOKEN_DENYLIST) private readonly denylist: TokenDenylist,
  ) {}

  async issue(params: IssueTokenParams): Promise<StoredToken> {
    const token: StoredToken = {
      jti: randomUUID(),
      userId: params.userId,
      clientId: params.clientId,
      kind: params.kind,
      scope: params.scope,
      codeChallenge: params.codeChallenge ?? '',
      expiresAt: new Date(Date.now() + params.ttlSeconds * 1000),
      ...(params.role !== undefined ? { role: params.role } : {}),
      ...(params.patientRef !== undefined ? { patientRef: params.patientRef } : {}),
      ...(params.fhirUser !== undefined ? { fhirUser: params.fhirUser } : {}),
    };
    await this.store.save(token);
    return token;
  }

  /**
   * Single-use consumption: the row is deleted and its `jti` marked as reused, so
   * a replayed code or a rotated refresh token can never be used twice. Only the
   * `reuse:` namespace is written — the caller's live access token stays valid.
   */
  async consume(jti: string, expectedKind: TokenKind): Promise<StoredToken | null> {
    const token = await this.store.find(jti);
    if (token === null || token.kind !== expectedKind) {
      return null;
    }
    await this.store.delete(jti);
    await this.denylist.add(
      `${REUSE_PREFIX}${jti}`,
      Math.ceil((token.expiresAt.getTime() - Date.now()) / 1000),
    );
    if (token.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    return token;
  }

  /** Reuse detection for the token endpoint: was this token already consumed or revoked? */
  async isDenied(jti: string): Promise<boolean> {
    return this.denylist.has(`${REUSE_PREFIX}${jti}`);
  }

  /**
   * Guard-layer lookup (`TokenRevocationChecker`): was this `jti`/`sid`
   * explicitly revoked? Only the `session:` namespace counts, so rotation does
   * not end the session it just refreshed.
   */
  async isRevoked(key: string): Promise<boolean> {
    return this.denylist.has(`${SESSION_PREFIX}${key}`);
  }

  /**
   * Read-only lookup used by ownership checks (RFC 7009 §2.1) before a token is
   * revoked. Unlike `consume` it neither deletes the row nor touches the
   * denylist, so a caller that fails the ownership check leaves no trace.
   */
  async find(jti: string): Promise<StoredToken | null> {
    return this.store.find(jti);
  }

  /**
   * Ends the whole session: the row is dropped, the `jti` is sealed against
   * reuse, and the `jti` is recorded as a revoked session so the access token
   * issued with that `sid` is refused by the guard layer (`TOKEN_REVOKED`).
   *
   * The session entry outlives every access token minted for it — a flat
   * `ACCESS_TOKEN_TTL_SECONDS` rather than the refresh token's remaining
   * lifetime, because a pair may be minted one second before the refresh token
   * itself would have expired.
   */
  async revoke(jti: string): Promise<void> {
    await this.store.delete(jti);
    await this.denylist.add(`${REUSE_PREFIX}${jti}`, REFRESH_TOKEN_TTL_SECONDS);
    await this.denylist.add(`${SESSION_PREFIX}${jti}`, ACCESS_TOKEN_TTL_SECONDS);
  }
}
