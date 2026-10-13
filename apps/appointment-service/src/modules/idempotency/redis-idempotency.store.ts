import Redis from 'ioredis';

import type { IdempotencyStore } from './idempotency.service';

/** Redis-backed store. `REDIS_URL` is required: booking must not run without replay protection. */
export function createRedisIdempotencyStore(env: NodeJS.ProcessEnv = process.env): IdempotencyStore {
  const url = env['REDIS_URL'];
  if (url === undefined || url === '') {
    throw new Error('REDIS_URL is not configured — Idempotency-Key replay protection needs it');
  }
  const client = new Redis(url, { maxRetriesPerRequest: 1 });
  return {
    get: (key) => client.get(key),
    set: async (key, value, ttlSeconds) => {
      await client.set(key, value, 'EX', ttlSeconds);
    },
  };
}
