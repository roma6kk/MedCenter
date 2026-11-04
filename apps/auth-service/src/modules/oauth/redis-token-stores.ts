import { Logger, type OnModuleDestroy } from '@nestjs/common';
import { DENYLIST_KEY_PREFIX } from '@medcenter/common';
import Redis from 'ioredis';

import {
  InMemoryTokenDenylist,
  InMemoryTokenStore,
  type StoredToken,
  type TokenDenylist,
  type TokenStore,
} from './token.service';

const TOKEN_KEY_PREFIX = 'oauth:token:';

/** Commands that hang on a dead Redis must fail within a request's patience. */
const COMMAND_TIMEOUT_MS = 2000;

/** The subset of ioredis the stores use, so tests can pass a fake. */
export interface RedisTokenClient {
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  getdel(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  exists(...keys: string[]): Promise<number>;
  quit(): Promise<unknown>;
}

/** A TTL the server accepts: a token that is already past its expiry still gets one second. */
function ttlSecondsOf(seconds: number): number {
  return Math.max(1, Math.ceil(seconds));
}

function parseStored(raw: string | null): StoredToken | null {
  if (raw === null) {
    return null;
  }
  const parsed = JSON.parse(raw) as Omit<StoredToken, 'expiresAt'> & { readonly expiresAt: string };
  return { ...parsed, expiresAt: new Date(parsed.expiresAt) };
}

/**
 * Codes and refresh tokens in Redis (`SET … EX`), so they survive a restart and
 * are shared by every replica. `take` is `GETDEL`: of two concurrent spends of
 * one token exactly one gets it. Errors propagate — a store that cannot be
 * reached must not look like "token unknown".
 */
export class RedisTokenStore implements TokenStore, OnModuleDestroy {
  private readonly logger = new Logger(RedisTokenStore.name);

  constructor(private readonly redis: RedisTokenClient) {}

  async save(token: StoredToken): Promise<void> {
    const ttl = ttlSecondsOf((token.expiresAt.getTime() - Date.now()) / 1000);
    await this.redis.set(`${TOKEN_KEY_PREFIX}${token.jti}`, JSON.stringify(token), 'EX', ttl);
  }

  async find(jti: string): Promise<StoredToken | null> {
    return parseStored(await this.redis.get(`${TOKEN_KEY_PREFIX}${jti}`));
  }

  async take(jti: string): Promise<StoredToken | null> {
    return parseStored(await this.redis.getdel(`${TOKEN_KEY_PREFIX}${jti}`));
  }

  async delete(jti: string): Promise<void> {
    await this.redis.del(`${TOKEN_KEY_PREFIX}${jti}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch((error: unknown) => {
      this.logger.warn({ err: error }, 'Token store connection did not close cleanly');
    });
  }
}

/**
 * The denylist in Redis under the prefix every BFF's revocation checker reads
 * (`DENYLIST_KEY_PREFIX`), so a `session:` entry written here is seen by all.
 */
export class RedisTokenDenylist implements TokenDenylist {
  constructor(private readonly redis: RedisTokenClient) {}

  async add(jti: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(`${DENYLIST_KEY_PREFIX}${jti}`, '1', 'EX', ttlSecondsOf(ttlSeconds));
  }

  async has(jti: string): Promise<boolean> {
    return (await this.redis.exists(`${DENYLIST_KEY_PREFIX}${jti}`)) > 0;
  }
}

export const TOKEN_STORES = Symbol('TOKEN_STORES');

export interface TokenStores {
  readonly store: TokenStore;
  readonly denylist: TokenDenylist;
}

/** Redis when `REDIS_URL` is set (compose, production), per-process maps otherwise (unit and e2e runs). */
export function createTokenStores(source: NodeJS.ProcessEnv = process.env): TokenStores {
  const url = source['REDIS_URL'];
  if (url === undefined || url === '') {
    return { store: new InMemoryTokenStore(), denylist: new InMemoryTokenDenylist() };
  }
  const client = new Redis(url, { maxRetriesPerRequest: 1, commandTimeout: COMMAND_TIMEOUT_MS });
  client.on('error', (error: Error) => {
    // Without a listener an idle connection failure would crash the process.
    new Logger(RedisTokenStore.name).warn({ err: error }, 'Token store Redis connection error');
  });
  return { store: new RedisTokenStore(client), denylist: new RedisTokenDenylist(client) };
}
