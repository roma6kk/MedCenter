import type { Logger } from '@nestjs/common';
import { parseGuardEnv } from '@medcenter/config';
import Redis, { type RedisOptions } from 'ioredis';

import { RedisRateLimitStore } from './redis-rate-limit.store';
import { setRateLimitStore } from './rate-limit.guard';

/**
 * Client options for Redis on the request path (rate-limit counters, cache
 * reads). Callers degrade instead of failing — `RateLimitGuard` to "allow" — so
 * the client must give up fast: without a `commandTimeout`, a Redis that drops
 * packets without refusing the connection holds every request for ioredis'
 * default `connectTimeout` (10 s).
 *
 * - `connectTimeout` / `commandTimeout`: bound a dead and a slow server.
 * - `enableOfflineQueue: false`: while the socket is down a command fails at
 *   once instead of queueing behind the reconnect.
 */
export const FAIL_FAST_REDIS_OPTIONS: Readonly<RedisOptions> = {
  maxRetriesPerRequest: 1,
  connectTimeout: 1_000,
  commandTimeout: 250,
  enableOfflineQueue: false,
};

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
