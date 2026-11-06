import type Redis from 'ioredis';
import type { RateLimitStore } from './rate-limit.guard';

const KEY_PREFIX = 'ratelimit:';

/** INCR and the TTL in one script: a crash between two commands cannot leave a bucket that never expires. */
const INCREMENT_SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return hits
`;

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
