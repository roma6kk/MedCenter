import { Logger } from '@nestjs/common';
import { FAIL_FAST_REDIS_OPTIONS, type IdempotencyStore } from '@medcenter/common';
import Redis from 'ioredis';

import type { CacheStore } from './redis-cache.service';

export class RedisCacheStore implements CacheStore, IdempotencyStore {
  private readonly logger = new Logger(RedisCacheStore.name);

  constructor(private readonly client: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    return (await this.client.set(key, value, 'EX', ttlSeconds, 'NX')) === 'OK';
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
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
    // `quit()` flushes the command queue and closes the connection cleanly.
    await this.client.quit().catch((error: unknown) => {
      this.logger.warn(error as Error, 'Redis connection did not close cleanly');
    });
  }
}

export function createRedisCacheStore(env: NodeJS.ProcessEnv = process.env): RedisCacheStore | null {
  const url = env['REDIS_URL'];
  if (url === undefined || url === '') {
    return null;
  }
  const client = new Redis(url, FAIL_FAST_REDIS_OPTIONS);
  client.on('error', (error: Error) => {
    // Without a listener an idle connection failure crashes the Node process.
    new Logger(RedisCacheStore.name).warn(error, 'Redis connection error');
  });
  return new RedisCacheStore(client);
}
