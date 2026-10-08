import { RedisRateLimitStore } from './redis-rate-limit.store';

describe('RedisRateLimitStore', () => {
  it('should run one atomic script on the namespaced key with the window TTL', async () => {
    const client = { eval: jest.fn().mockResolvedValue(1) };
    const store = new RedisRateLimitStore(client);

    await store.increment('sub-1:POST:/oauth/token:29000000', 60);

    expect(client.eval).toHaveBeenCalledTimes(1);
    expect(client.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('INCR'"),
      1,
      'ratelimit:sub-1:POST:/oauth/token:29000000',
      '60',
    );
  });

  it('should return the hit count reported by Redis as a number', async () => {
    const store = new RedisRateLimitStore({ eval: jest.fn().mockResolvedValue(21) });

    await expect(store.increment('k', 60)).resolves.toBe(21);
  });

  it('should propagate Redis errors so the guard can fail open', async () => {
    const store = new RedisRateLimitStore({
      eval: jest.fn().mockRejectedValue(new Error('connection refused')),
    });

    await expect(store.increment('k', 60)).rejects.toThrow('connection refused');
  });
});
