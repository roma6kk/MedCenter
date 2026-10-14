import type { RedisOptions } from 'ioredis';

/**
 * Client options for Redis on the request path (cache reads, rate-limit
 * counters). Both callers degrade instead of failing — the cache to a miss,
 * `RateLimitGuard` to "allow" — so the client must give up fast: without a
 * `commandTimeout`, a Redis that drops packets without refusing the connection
 * holds every request for ioredis' default `connectTimeout` (10 s) and breaks
 * the NFR-005 budget (slot search < 500 ms) in exactly the scenario the
 * degradation exists for.
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
