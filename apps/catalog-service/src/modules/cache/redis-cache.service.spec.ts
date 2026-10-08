import {
  CACHE_KEYS,
  CACHE_TTLS,
  RedisCacheService,
  type CacheStore,
} from './redis-cache.service';

function createStoreMock(overrides: Partial<CacheStore> = {}): CacheStore {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    delByPrefix: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('RedisCacheService.getOrLoad', () => {
  it('should hit the store and skip the loader', async () => {
    const store = createStoreMock({
      get: jest.fn().mockResolvedValue(JSON.stringify([{ id: 'svc-1' }])),
    });
    const cache = new RedisCacheService(store);
    const loader = jest.fn().mockResolvedValue([{ id: 'svc-2' }]);

    await expect(cache.getOrLoad('k', 10, loader)).resolves.toEqual([{ id: 'svc-1' }]);
    expect(loader).not.toHaveBeenCalled();
  });

  it('should fall through to the loader and write back on store failure', async () => {
    const store = createStoreMock({ get: jest.fn().mockRejectedValue(new Error('down')) });
    const cache = new RedisCacheService(store);
    const loader = jest.fn().mockResolvedValue({ ok: true });

    await expect(cache.getOrLoad('k', 10, loader)).resolves.toEqual({ ok: true });
    expect(store.set).toHaveBeenCalledWith('k', JSON.stringify({ ok: true }), 10);
  });

  it('should degrade to always-miss when no store is bound', async () => {
    const cache = new RedisCacheService();
    const loader = jest.fn().mockResolvedValue({ ok: true });

    await expect(cache.getOrLoad('k', 10, loader)).resolves.toEqual({ ok: true });
    expect(loader).toHaveBeenCalledTimes(1);
  });
});

describe('RedisCacheService.invalidate', () => {
  it('should route keys ending in ":" through delByPrefix', async () => {
    const store = createStoreMock();
    const cache = new RedisCacheService(store);

    await cache.invalidate([CACHE_KEYS.SCHEDULE_SLOTS('sched-9')]);

    expect(store.delByPrefix).toHaveBeenCalledWith('slots:sched-9:');
    expect(store.del).not.toHaveBeenCalled();
  });

  it('should route plain keys through del and clear every services page via prefix', async () => {
    const store = createStoreMock();
    const cache = new RedisCacheService(store);

    await cache.invalidate([`${CACHE_KEYS.SERVICES}:`]);

    expect(store.delByPrefix).toHaveBeenCalledWith('catalog:services:');
    expect(store.del).not.toHaveBeenCalled();
  });

  it('should handle mixed exact and prefix keys in one call', async () => {
    const store = createStoreMock();
    const cache = new RedisCacheService(store);

    await cache.invalidate(['exact-key', 'prefix:']);

    expect(store.del).toHaveBeenCalledWith(['exact-key']);
    expect(store.delByPrefix).toHaveBeenCalledWith('prefix:');
  });

  it('should not throw when the store rejects', async () => {
    const store = createStoreMock({ delByPrefix: jest.fn().mockRejectedValue(new Error('down')) });
    const cache = new RedisCacheService(store);

    await expect(cache.invalidate(['prefix:'])).resolves.toBeUndefined();
  });

  it('should prefer the TTL arg on write (SLOTS key convention intact)', async () => {
    const store = createStoreMock();
    const cache = new RedisCacheService(store);
    const loader = jest.fn().mockResolvedValue([]);

    await cache.getOrLoad(CACHE_KEYS.SLOTS('s1', '2026-11-02', '2026-11-03'), CACHE_TTLS.SLOTS_SECONDS, loader);

    expect(store.set).toHaveBeenCalledWith(CACHE_KEYS.SLOTS('s1', '2026-11-02', '2026-11-03'), expect.any(String), CACHE_TTLS.SLOTS_SECONDS);
  });
});
