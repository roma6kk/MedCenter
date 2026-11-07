import { Inject, Injectable } from '@nestjs/common';
import { SESSION_DENYLIST_NAMESPACE, type TokenRevocationChecker } from '@medcenter/common';
import { randomUUID } from 'node:crypto';

import { ACCESS_TOKEN_TTL_SECONDS } from './jwt.service';

type TokenKind = 'code' | 'refresh';

export const AUTHORIZATION_CODE_TTL_SECONDS = 300;
export const REFRESH_TOKEN_TTL_SECONDS = 14 * 24 * 60 * 60;

// reuse: = consumed (replay fails with invalid_grant); session: = revoked (guard answers TOKEN_REVOKED). Rotation writes only reuse:, or every refresh would log its caller out.
const REUSE_PREFIX = 'reuse:';
const SESSION_PREFIX = SESSION_DENYLIST_NAMESPACE;

export interface StoredToken {
  readonly jti: string;
  readonly userId: string;
  readonly clientId: string;
  readonly kind: TokenKind;
  readonly scope: string;
  readonly codeChallenge: string;
  readonly expiresAt: Date;
  readonly role?: string;
  readonly patientRef?: string;
  readonly fhirUser?: string;
}

export interface TokenStore {
  save(token: StoredToken): Promise<void>;
  find(jti: string): Promise<StoredToken | null>;
  take(jti: string): Promise<StoredToken | null>;
  delete(jti: string): Promise<void>;
}

export interface TokenDenylist {
  add(jti: string, ttlSeconds: number): Promise<void>;
  has(jti: string): Promise<boolean>;
}

export const TOKEN_STORE = 'TOKEN_STORE';
export const TOKEN_DENYLIST = 'TOKEN_DENYLIST';

export class InMemoryTokenStore implements TokenStore {
  private readonly tokens = new Map<string, StoredToken>();

  async save(token: StoredToken): Promise<void> {
    this.tokens.set(token.jti, token);
  }

  async find(jti: string): Promise<StoredToken | null> {
    return this.tokens.get(jti) ?? null;
  }

  async take(jti: string): Promise<StoredToken | null> {
    const token = this.tokens.get(jti) ?? null;
    this.tokens.delete(jti);
    return token;
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

  async consume(jti: string, expectedKind: TokenKind): Promise<StoredToken | null> {
    const found = await this.store.find(jti);
    if (found === null || found.kind !== expectedKind) {
      return null;
    }
    const token = await this.store.take(jti);
    if (token === null) {
      return null;
    }
    await this.denylist.add(
      `${REUSE_PREFIX}${jti}`,
      Math.ceil((token.expiresAt.getTime() - Date.now()) / 1000),
    );
    if (token.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    return token;
  }

  async isDenied(jti: string): Promise<boolean> {
    return this.denylist.has(`${REUSE_PREFIX}${jti}`);
  }

  async isRevoked(key: string): Promise<boolean> {
    return this.denylist.has(`${SESSION_PREFIX}${key}`);
  }

  async find(jti: string): Promise<StoredToken | null> {
    return this.store.find(jti);
  }

  // The session entry lasts a flat ACCESS_TOKEN_TTL_SECONDS: a pair may be minted one second before the refresh token expires.
  async revoke(jti: string): Promise<void> {
    await this.store.delete(jti);
    await this.denylist.add(`${REUSE_PREFIX}${jti}`, REFRESH_TOKEN_TTL_SECONDS);
    await this.denylist.add(`${SESSION_PREFIX}${jti}`, ACCESS_TOKEN_TTL_SECONDS);
  }
}
