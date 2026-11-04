import { Logger, type OnModuleDestroy } from '@nestjs/common';
import type { IdempotencyStore } from '@medcenter/common';
import Redis from 'ioredis';

/** The slice of an ioredis client the store uses; a fake in unit tests. */
export interface RedisLikeClient {
  readonly status: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, secondsToken: 'EX', seconds: number): Promise<unknown>;
  /** `SET key value EX seconds NX`: `'OK'` when the key was free, `null` when it was taken. */
  set(key: string, value: string, secondsToken: 'EX', seconds: number, mode: 'NX'): Promise<unknown>;
  del(key: string): Promise<unknown>;
  quit(): Promise<unknown>;
  disconnect(): void;
}

/**
 * Redis-backed `Idempotency-Key` store. The connection is opened on first use
 * and closed with the module, so a process that never books (an e2e suite, a
 * probe) neither dials Redis nor keeps the event loop alive on shutdown.
 */
export class RedisIdempotencyStore implements IdempotencyStore, OnModuleDestroy {
  constructor(private readonly client: RedisLikeClient) {}

  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  /** The in-flight mark of a request: only the first caller gets `true` (atomic in Redis). */
  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    return (await this.client.set(key, value, 'EX', ttlSeconds, 'NX')) === 'OK';
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'ready') {
      await this.client.quit();
      return;
    }
    // Never connected (or already gone): `quit` would dial Redis just to close it.
    this.client.disconnect();
  }
}

/** `REDIS_URL` is required: booking must not run without replay protection. */
export function createRedisIdempotencyStore(env: NodeJS.ProcessEnv = process.env): RedisIdempotencyStore {
  const url = env['REDIS_URL'];
  if (url === undefined || url === '') {
    throw new Error('REDIS_URL is not configured — Idempotency-Key replay protection needs it');
  }
  const logger = new Logger(RedisIdempotencyStore.name);
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    // A Redis that stops answering (rather than refusing) must fail the request, not hang it.
    connectTimeout: 2_000,
    commandTimeout: 2_000,
  });
  client.on('error', (error: Error) => {
    logger.warn(`Idempotency Redis connection error: ${error.message}`);
  });
  return new RedisIdempotencyStore(client);
}
