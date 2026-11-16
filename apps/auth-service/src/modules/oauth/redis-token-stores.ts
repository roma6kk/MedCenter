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
const SESSION_KEY_PREFIX = 'oauth:session-current:';
const USER_SESSIONS_PREFIX = 'oauth:user-sessions:';

const COMMAND_TIMEOUT_MS = 2000;

export function connectRedis(url: string, owner: string, label: string): Redis {
  const client = new Redis(url, { maxRetriesPerRequest: 1, commandTimeout: COMMAND_TIMEOUT_MS });
  client.on('error', (error: Error) => {
    // Without a listener an idle connection failure would crash the process.
    new Logger(owner).warn({ err: error }, `${label} Redis connection error`);
  });
  return client;
}

export interface RedisTokenClient {
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  set(key: string, value: string, keepTtl: 'KEEPTTL', onlyIfExists: 'XX'): Promise<unknown>;
  get(key: string): Promise<string | null>;
  getdel(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  sadd(key: string, member: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
  expire(key: string, seconds: number): Promise<number>;
  exists(...keys: string[]): Promise<number>;
  quit(): Promise<unknown>;
}

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

// take is GETDEL: of two concurrent spends of one token exactly one gets it. Errors propagate: an unreachable store must not look like an unknown token.
export class RedisTokenStore implements TokenStore, OnModuleDestroy {
  private readonly logger = new Logger(RedisTokenStore.name);

  constructor(private readonly redis: RedisTokenClient) {}

  async save(token: StoredToken): Promise<void> {
    const ttl = ttlSecondsOf((token.expiresAt.getTime() - Date.now()) / 1000);
    await this.redis.set(`${TOKEN_KEY_PREFIX}${token.jti}`, JSON.stringify(token), 'EX', ttl);
    if (token.kind === 'refresh' && token.sessionId !== undefined) {
      await this.redis.set(`${SESSION_KEY_PREFIX}${token.sessionId}`, token.jti, 'EX', ttl);
      await this.redis.sadd(`${USER_SESSIONS_PREFIX}${token.userId}`, token.sessionId);
      await this.redis.expire(`${USER_SESSIONS_PREFIX}${token.userId}`, ttl);
    }
  }

  async findCurrent(sessionId: string): Promise<StoredToken | null> {
    const jti = await this.redis.get(`${SESSION_KEY_PREFIX}${sessionId}`);
    return jti === null ? null : this.find(jti);
  }

  async find(jti: string): Promise<StoredToken | null> {
    return parseStored(await this.redis.get(`${TOKEN_KEY_PREFIX}${jti}`));
  }

  async take(jti: string): Promise<StoredToken | null> {
    return parseStored(await this.redis.getdel(`${TOKEN_KEY_PREFIX}${jti}`));
  }

  // Read-modify-write with XX: a concurrent rotation that already took the token cannot be undone by a late touch.
  async touch(jti: string, lastActivityAt: number): Promise<void> {
    const key = `${TOKEN_KEY_PREFIX}${jti}`;
    const token = parseStored(await this.redis.get(key));
    if (token !== null) {
      await this.redis.set(key, JSON.stringify({ ...token, lastActivityAt }), 'KEEPTTL', 'XX');
    }
  }

  async delete(jti: string): Promise<void> {
    await this.redis.del(`${TOKEN_KEY_PREFIX}${jti}`);
  }

  async sessionsOf(userId: string): Promise<string[]> {
    return this.redis.smembers(`${USER_SESSIONS_PREFIX}${userId}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch((error: unknown) => {
      this.logger.warn({ err: error }, 'Token store connection did not close cleanly');
    });
  }
}

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

export function createTokenStores(source: NodeJS.ProcessEnv = process.env): TokenStores {
  const url = source['REDIS_URL'];
  if (url === undefined || url === '') {
    return { store: new InMemoryTokenStore(), denylist: new InMemoryTokenDenylist() };
  }
  const client = connectRedis(url, RedisTokenStore.name, 'Token store');
  return { store: new RedisTokenStore(client), denylist: new RedisTokenDenylist(client) };
}
