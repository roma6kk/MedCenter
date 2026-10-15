import { Logger } from '@nestjs/common';

import { InMemoryCacheStore } from './__tests__/in-memory-cache-store';
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

describe('RedisCacheService corrupt entries', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should reload and overwrite the entry when the cached value is not valid JSON', async () => {
    // Arrange
    const store = createStoreMock({ get: jest.fn().mockResolvedValue('{"truncated":') });
    const cache = new RedisCacheService(store);
    const loader = jest.fn().mockResolvedValue({ ok: true });

    // Act
    const value = await cache.getOrLoad('k', 10, loader);

    // Assert — a damaged entry in the shared Redis costs one reload, not a 500.
    expect(value).toEqual({ ok: true });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(store.set).toHaveBeenCalledWith('k', JSON.stringify({ ok: true }), 10);
  });

  it('should report a miss from getJson when the cached value is not valid JSON', async () => {
    // Arrange
    const cache = new RedisCacheService(createStoreMock({ get: jest.fn().mockResolvedValue('not json') }));

    // Act
    const value = await cache.getJson('k');

    // Assert
    expect(value).toBeNull();
  });

  it('should round-trip a value through setJson and getJson when a store is bound', async () => {
    // Arrange
    const store = new InMemoryCacheStore();
    const cache = new RedisCacheService(store);

    // Act
    await cache.setJson('k', [{ id: 'slot-1' }], 15);
    const value = await cache.getJson<Array<{ id: string }>>('k');

    // Assert
    expect(value).toEqual([{ id: 'slot-1' }]);
  });
});

describe('RedisCacheService outage logging', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should log one compact warning per interval when many reads fail in a row', async () => {
    // Arrange
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-02T10:00:00.000Z'));
    const cache = new RedisCacheService(createStoreMock({ get: jest.fn().mockRejectedValue(new Error('down')) }));

    // Act — one request reads a page per clinic day.
    await Promise.all(Array.from({ length: 15 }, (_, day) => cache.getJson(`page-${day}`)));

    // Assert
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('down'));

    // Act — the next interval logs again.
    nowSpy.mockReturnValue(Date.parse('2026-11-02T10:00:11.000Z'));
    await cache.getJson('page-again');

    // Assert
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('should keep read and write warnings apart when both kinds fail in the same interval', async () => {
    // Arrange
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-02T10:00:00.000Z'));
    const cache = new RedisCacheService(
      createStoreMock({ get: jest.fn().mockRejectedValue(new Error('down')), set: jest.fn().mockRejectedValue(new Error('down')) }),
    );

    // Act
    await cache.getOrLoad('k', 10, async () => ({ ok: true }));

    // Assert
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe('CACHE_KEYS', () => {
  it('should build one doctor-slot key per doctor and clinic day when the day is normalized', () => {
    expect(CACHE_KEYS.DOCTOR_SLOTS_DAY('prac-1', '2026-11-02')).toBe('catalog:doctor-slots:prac-1:2026-11-02');
    expect(CACHE_KEYS.DOCTOR_SLOTS_DAY('prac-1', '2026-11-02').startsWith(CACHE_KEYS.ALL_DOCTOR_SLOTS)).toBe(true);
  });

  it('should keep every services page under the prefix the services invalidation clears', () => {
    expect(CACHE_KEYS.SERVICES_PAGE(2, 20).startsWith(`${CACHE_KEYS.SERVICES}:`)).toBe(true);
  });

  it('should version the services page key when the cached value is the pagination envelope', () => {
    expect(CACHE_KEYS.SERVICES_PAGE(2, 20)).toBe('catalog:services:v2:2:20');
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
