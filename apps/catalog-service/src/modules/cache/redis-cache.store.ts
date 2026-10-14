import { Logger } from '@nestjs/common';
import Redis from 'ioredis';

import { FAIL_FAST_REDIS_OPTIONS } from '../../config/redis-options';
import type { CacheStore } from './redis-cache.service';

/**
 * Production `CacheStore` backed by ioredis (NFR-005).
 *
 * Reads/writes never break the request: Redis failures are logged and treated
 * as a miss/write-noop by `RedisCacheService`, so this class only propagates
 * errors upward.
 *
 * `delByPrefix` uses a non-blocking SCAN loop (never `KEYS` — it stalls a
 * shared Redis under load) and keeps only matched keys in memory per cursor.
 */
export class RedisCacheStore implements CacheStore {
  private readonly logger = new Logger(RedisCacheStore.name);

  constructor(private readonly client: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async del(keys: string[]): Promise<void> {
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  async delByPrefix(prefix: string): Promise<void> {
    let cursor = '0';
    do {
      const [next, keys] = await this.client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
      cursor = next;
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } while (cursor !== '0');
  }

  async onModuleDestroy(): Promise<void> {
    // `quit()` flushes the command queue and closes the connection cleanly;
    // durable enough for a cache-only connection.
    await this.client.quit().catch((error: unknown) => {
      this.logger.warn(error as Error, 'Redis connection did not close cleanly');
    });
  }
}

/**
 * Module wiring: reads `REDIS_URL` from the environment eagerly so a missing
 * or broken URL surfaces in the startup logs instead of the first request.
 *
 * The client fails fast (`FAIL_FAST_REDIS_OPTIONS`: short connect and command
 * timeouts, no offline queue): the cache sits on the hot path of the public
 * catalog, and the degrade-to-miss contract of `RedisCacheService` only helps
 * when an unreachable Redis is given up on within milliseconds, not after
 * ioredis' default 10 s connect timeout.
 */
export function createRedisCacheStore(env: NodeJS.ProcessEnv = process.env): RedisCacheStore | null {
  const url = env['REDIS_URL'];
  if (url === undefined || url === '') {
    return null;
  }
  const client = new Redis(url, FAIL_FAST_REDIS_OPTIONS);
  client.on('error', (error: Error) => {
    // Noise guard: without this listener an idle connection failure crashes
    // the Node process (https://github.com/redis/ioredis#events).
    new Logger(RedisCacheStore.name).warn(error, 'Redis connection error');
  });
  return new RedisCacheStore(client);
}
