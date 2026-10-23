import Redis from 'ioredis';

/** Mutual exclusion between relay replicas: at most one polls at a time. */
export interface LockStore {
  /** `true` when `token` now holds `key` for `ttlMs`. */
  acquire(key: string, token: string, ttlMs: number): Promise<boolean>;
  /** Frees `key` only if `token` still holds it, so a slow relay never frees a successor's lock. */
  release(key: string, token: string): Promise<void>;
  close(): Promise<void>;
}

export const LOCK_STORE = Symbol('LOCK_STORE');

const RELEASE_SCRIPT = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

/** `SET key token PX ttl NX` with a compare-and-delete release. `REDIS_URL` is required. */
export function createRedisLockStore(env: NodeJS.ProcessEnv = process.env): LockStore {
  const url = env['REDIS_URL'];
  if (url === undefined || url === '') {
    throw new Error('REDIS_URL is not configured — the relay lock needs it');
  }
  const client = new Redis(url, { maxRetriesPerRequest: 1 });
  // An unlistened `error` event would take the process down; a failed command already surfaces to the caller.
  client.on('error', () => undefined);
  return {
    acquire: async (key, token, ttlMs) => (await client.set(key, token, 'PX', ttlMs, 'NX')) === 'OK',
    release: async (key, token) => {
      await client.eval(RELEASE_SCRIPT, 1, key, token);
    },
    close: async () => {
      client.disconnect();
    },
  };
}
