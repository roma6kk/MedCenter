import Redis from 'ioredis';

import type { ClaimState, DedupStore } from './deduplication.service';

const IN_PROGRESS = 'in-progress';
const DONE = 'done';

/** Redis-backed dedup store. `REDIS_URL` is required: without it duplicates would be written twice. */
export function createRedisDedupStore(env: NodeJS.ProcessEnv = process.env): DedupStore {
  const url = env['REDIS_URL'];
  if (url === undefined || url === '') {
    throw new Error('REDIS_URL is not configured — event dedup needs it');
  }
  const client = new Redis(url, { maxRetriesPerRequest: 1 });
  return {
    claim: async (key, leaseSeconds): Promise<ClaimState> => {
      if ((await client.set(key, IN_PROGRESS, 'EX', leaseSeconds, 'NX')) === 'OK') {
        return 'claimed';
      }
      // A key that vanished between SET NX and GET reports in-progress: the redelivery is retried, not dropped.
      return (await client.get(key)) === DONE ? 'done' : 'in-progress';
    },
    complete: async (key, ttlSeconds) => {
      await client.set(key, DONE, 'EX', ttlSeconds);
    },
    delete: async (key) => {
      await client.del(key);
    },
  };
}
