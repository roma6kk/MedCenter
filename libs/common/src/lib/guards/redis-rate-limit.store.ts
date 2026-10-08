import type Redis from 'ioredis';
import type { RateLimitStore } from './rate-limit.guard';

const KEY_PREFIX = 'ratelimit:';

/**
 * INCR and the window TTL in one atomic script. Setting the TTL only on the
 * first hit, inside the same script, means a crash between the two commands
 * cannot leave a bucket that never expires.
 */
const INCREMENT_SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return hits
`;

/**
 * Redis-backed `RateLimitStore` shared by every replica of a service, so the
 * per-minute budget holds across instances. Errors propagate to the guard,
 * which fails open and logs them.
 */
export class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly client: Pick<Redis, 'eval'>) {}

  async increment(key: string, windowSeconds: number): Promise<number> {
    const hits = await this.client.eval(
      INCREMENT_SCRIPT,
      1,
      `${KEY_PREFIX}${key}`,
      String(windowSeconds),
    );
    return Number(hits);
  }
}
