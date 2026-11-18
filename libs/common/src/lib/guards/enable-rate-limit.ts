import type { Logger } from '@nestjs/common';
import { parseGuardEnv } from '@medcenter/config';
import Redis, { type RedisOptions } from 'ioredis';

import { RedisRateLimitStore } from './redis-rate-limit.store';
import { setRateLimitStore } from './rate-limit.guard';

/** Redis on the request path must give up fast: a server that drops packets would otherwise hold every request for ioredis' 10 s default. */
export const FAIL_FAST_REDIS_OPTIONS: Readonly<RedisOptions> = {
  maxRetriesPerRequest: 1,
  connectTimeout: 1_000,
  commandTimeout: 250,
  enableOfflineQueue: false,
};

/** Without a store `RateLimitGuard` does not count at all; Redis errors fail open in the guard. */
export function enableRateLimit(env: NodeJS.ProcessEnv, logger: Logger): void {
  const { REDIS_URL } = parseGuardEnv(env);
  const redis = new Redis(REDIS_URL, FAIL_FAST_REDIS_OPTIONS);
  redis.on('error', (error: Error) => {
    logger.warn(`Rate-limit Redis connection error: ${error.message}`);
  });
  setRateLimitStore(new RedisRateLimitStore(redis));
}
