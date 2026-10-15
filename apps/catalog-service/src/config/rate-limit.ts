import type { Logger } from '@nestjs/common';
import { RedisRateLimitStore, setRateLimitStore } from '@medcenter/common';
import { parseGuardEnv } from '@medcenter/config';
import Redis from 'ioredis';

import { FAIL_FAST_REDIS_OPTIONS } from './redis-options';

/**
 * NFR-006: `RateLimitGuard` only counts once a store is set; without one the
 * per-user budget (120 req/min) is silently off. The store lives in Redis so
 * the budget holds across replicas. Redis errors fail open in the guard, so the
 * connection's error listener only logs.
 *
 * Throws when a guard variable is missing, which fails the boot immediately.
 */
export function enableRateLimit(env: NodeJS.ProcessEnv, logger: Logger): void {
  const { REDIS_URL } = parseGuardEnv(env);
  const redis = new Redis(REDIS_URL, FAIL_FAST_REDIS_OPTIONS);
  redis.on('error', (error: Error) => {
    logger.warn(`Rate-limit Redis connection error: ${error.message}`);
  });
  setRateLimitStore(new RedisRateLimitStore(redis));
}
