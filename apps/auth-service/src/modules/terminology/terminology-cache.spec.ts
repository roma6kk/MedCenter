import { InMemoryTerminologyCache, RedisTerminologyCache, createTerminologyCache, type RedisLike } from './terminology-cache';

describe('InMemoryTerminologyCache', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return the stored value when the entry is still fresh', async () => {
    const cache = new InMemoryTerminologyCache();
    await cache.set('k', 'v', 60);

    expect(await cache.get('k')).toBe('v');
  });

  it('should drop the entry when its time to live has passed', async () => {
    const cache = new InMemoryTerminologyCache();
    await cache.set('k', 'v', 60);
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);

    expect(await cache.get('k')).toBeNull();
  });

  it('should evict the oldest entry when the bound is exceeded', async () => {
    const cache = new InMemoryTerminologyCache();
    for (let i = 0; i <= 500; i += 1) {
      await cache.set(`k${i}`, 'v', 60);
    }

    expect(await cache.get('k0')).toBeNull();
    expect(await cache.get('k500')).toBe('v');
  });

  it('should drop only the entries under the prefix when deleteByPrefix is called', async () => {
    const cache = new InMemoryTerminologyCache();
    await cache.set('terminology:expand:a', 'v', 60);
    await cache.set('terminology:expand-all:b', 'v', 60);
    await cache.set('other:c', 'v', 60);

    await cache.deleteByPrefix('terminology:expand');

    expect([await cache.get('terminology:expand:a'), await cache.get('terminology:expand-all:b')]).toEqual([null, null]);
    expect(await cache.get('other:c')).toBe('v');
  });
});

describe('RedisTerminologyCache', () => {
  function fakeRedis(overrides: Partial<RedisLike> = {}): jest.Mocked<RedisLike> {
    return {
      get: jest.fn().mockResolvedValue('cached'),
      set: jest.fn().mockResolvedValue('OK'),
      scan: jest.fn().mockResolvedValue(['0', []]),
      del: jest.fn().mockResolvedValue(0),
      quit: jest.fn().mockResolvedValue('OK'),
      ...overrides,
    } as jest.Mocked<RedisLike>;
  }

  it('should write with an expiry when a value is cached', async () => {
    const redis = fakeRedis();

    await new RedisTerminologyCache(redis).set('k', 'v', 3600);

    expect(redis.set).toHaveBeenCalledWith('k', 'v', 'EX', 3600);
  });

  it('should behave as a miss when Redis fails to read', async () => {
    const cache = new RedisTerminologyCache(fakeRedis({ get: jest.fn().mockRejectedValue(new Error('down')) }));

    expect(await cache.get('k')).toBeNull();
  });

  it('should swallow a failed write so the request still succeeds', async () => {
    const cache = new RedisTerminologyCache(fakeRedis({ set: jest.fn().mockRejectedValue(new Error('down')) }));

    await expect(cache.set('k', 'v', 60)).resolves.toBeUndefined();
  });

  it('should delete every key of every scan page when deleteByPrefix is called', async () => {
    const scan = jest.fn().mockResolvedValueOnce(['17', ['p:1', 'p:2']]).mockResolvedValueOnce(['0', ['p:3']]);
    const redis = fakeRedis({ scan });

    await new RedisTerminologyCache(redis).deleteByPrefix('p:');

    expect(scan).toHaveBeenNthCalledWith(1, '0', 'MATCH', 'p:*', 'COUNT', 200);
    expect(scan).toHaveBeenNthCalledWith(2, '17', 'MATCH', 'p:*', 'COUNT', 200);
    expect(redis.del.mock.calls).toEqual([['p:1', 'p:2'], ['p:3']]);
  });

  it('should match the prefix literally when it contains glob characters', async () => {
    const redis = fakeRedis();

    await new RedisTerminologyCache(redis).deleteByPrefix('a*b[1]');

    expect(redis.scan).toHaveBeenCalledWith('0', 'MATCH', 'a\\*b\\[1\\]*', 'COUNT', 200);
  });

  it('should swallow a failed sweep so the import still completes', async () => {
    const cache = new RedisTerminologyCache(fakeRedis({ scan: jest.fn().mockRejectedValue(new Error('down')) }));

    await expect(cache.deleteByPrefix('p:')).resolves.toBeUndefined();
  });

  it('should close the connection when the module is destroyed', async () => {
    const redis = fakeRedis();

    await new RedisTerminologyCache(redis).onModuleDestroy();

    expect(redis.quit).toHaveBeenCalled();
  });
});

describe('createTerminologyCache', () => {
  it('should fall back to the in-process cache when REDIS_URL is not set', () => {
    expect(createTerminologyCache({})).toBeInstanceOf(InMemoryTerminologyCache);
    expect(createTerminologyCache({ REDIS_URL: '' })).toBeInstanceOf(InMemoryTerminologyCache);
  });
});
