import { Logger, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Counter behind the per-account login throttle. Unlike the shared
 * `RateLimitGuard` store it must **fail closed**: a counter that cannot be
 * reached rejects, and the login step then refuses the attempt instead of
 * letting an unbounded password search through.
 */
export interface LoginAttemptStore {
  /** Counts one attempt on `key`; resolves to the attempts of the current window, this one included. */
  record(key: string, windowSeconds: number): Promise<number>;
  /** Forgets the attempts of `key` (a successful login). */
  clear(key: string): Promise<void>;
}

export const LOGIN_ATTEMPT_STORE = Symbol('LOGIN_ATTEMPT_STORE');

const KEY_PREFIX = 'auth:login-attempts:';

/** Upper bound of the in-process fallback: an address space of emails must not grow it without limit. */
const MAX_TRACKED_KEYS = 10_000;

interface AttemptWindow {
  count: number;
  readonly expiresAt: number;
}

/** Per-process counter for runs without Redis (local development, unit and e2e suites). */
export class InMemoryLoginAttemptStore implements LoginAttemptStore {
  private readonly windows = new Map<string, AttemptWindow>();

  async record(key: string, windowSeconds: number): Promise<number> {
    const now = Date.now();
    const current = this.windows.get(key);
    if (current !== undefined && current.expiresAt > now) {
      current.count += 1;
      return current.count;
    }
    this.evictIfFull(now);
    this.windows.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
    return 1;
  }

  async clear(key: string): Promise<void> {
    this.windows.delete(key);
  }

  private evictIfFull(now: number): void {
    if (this.windows.size < MAX_TRACKED_KEYS) {
      return;
    }
    for (const [key, attemptWindow] of this.windows) {
      if (attemptWindow.expiresAt <= now) {
        this.windows.delete(key);
      }
    }
    const oldest = this.windows.keys().next();
    if (this.windows.size >= MAX_TRACKED_KEYS && oldest.done !== true) {
      this.windows.delete(oldest.value);
    }
  }
}

/** The subset of ioredis the store uses, so tests can pass a fake. */
export interface RedisAttemptClient {
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  quit(): Promise<unknown>;
}

/** INCR and the window TTL in one atomic script: a crash between them cannot leave a counter that never expires. */
const RECORD_SCRIPT = `
local attempts = redis.call('INCR', KEYS[1])
if attempts == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return attempts
`;

/** Redis counter shared by every replica; errors propagate (fail closed). */
export class RedisLoginAttemptStore implements LoginAttemptStore, OnModuleDestroy {
  private readonly logger = new Logger(RedisLoginAttemptStore.name);

  constructor(private readonly redis: RedisAttemptClient) {}

  async record(key: string, windowSeconds: number): Promise<number> {
    return Number(await this.redis.eval(RECORD_SCRIPT, 1, `${KEY_PREFIX}${key}`, String(windowSeconds)));
  }

  async clear(key: string): Promise<void> {
    await this.redis.del(`${KEY_PREFIX}${key}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch((error: unknown) => {
      this.logger.warn({ err: error }, 'Login attempt store connection did not close cleanly');
    });
  }
}

/** Commands that hang on a dead Redis must fail within a login's patience. */
const COMMAND_TIMEOUT_MS = 2000;

/** Redis when `REDIS_URL` is set (compose, production), the in-process counter otherwise. */
export function createLoginAttemptStore(source: NodeJS.ProcessEnv = process.env): LoginAttemptStore {
  const url = source['REDIS_URL'];
  if (url === undefined || url === '') {
    return new InMemoryLoginAttemptStore();
  }
  const client = new Redis(url, { maxRetriesPerRequest: 1, commandTimeout: COMMAND_TIMEOUT_MS });
  client.on('error', (error: Error) => {
    // Without a listener an idle connection failure would crash the process.
    new Logger(RedisLoginAttemptStore.name).warn({ err: error }, 'Login attempt store Redis connection error');
  });
  return new RedisLoginAttemptStore(client);
}
