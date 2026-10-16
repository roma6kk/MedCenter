import type { FactoryProvider } from '@nestjs/common';
import { IDEMPOTENCY_STORE, type IdempotencyStore } from '@medcenter/common';

import { idempotencyStoreProvider, MEMORY_STORE_MAX_ENTRIES, MemoryIdempotencyStore } from './idempotency-store.provider';
import type { CacheStore } from './redis-cache.service';

const factory = idempotencyStoreProvider as FactoryProvider<IdempotencyStore>;

describe('idempotencyStoreProvider', () => {
  it('should be provided under the IDEMPOTENCY_STORE token', () => {
    expect(idempotencyStoreProvider).toMatchObject({ provide: IDEMPOTENCY_STORE });
  });

  it('should use the Redis cache store when one is configured, so a replay is answered by any replica', () => {
    const redisStore = { get: jest.fn(), set: jest.fn(), del: jest.fn(), delByPrefix: jest.fn() } as CacheStore;

    expect(factory.useFactory(redisStore)).toBe(redisStore);
  });

  it('should fall back to the process-local store when the cache has no Redis', () => {
    expect(factory.useFactory(null)).toBeInstanceOf(MemoryIdempotencyStore);
  });
});

describe('MemoryIdempotencyStore', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return what was stored when the key has not expired', async () => {
    const store = new MemoryIdempotencyStore();

    await store.set('k', 'v', 60);

    await expect(store.get('k')).resolves.toBe('v');
  });

  it('should return null for a key that was never stored', async () => {
    await expect(new MemoryIdempotencyStore().get('missing')).resolves.toBeNull();
  });

  it('should return null once the ttl has passed', async () => {
    jest.useFakeTimers();
    const store = new MemoryIdempotencyStore();
    await store.set('k', 'v', 60);

    jest.advanceTimersByTime(61_000);

    await expect(store.get('k')).resolves.toBeNull();
  });

  it('should drop the expired entries first when it is full, and keep the live ones', async () => {
    jest.useFakeTimers();
    const store = new MemoryIdempotencyStore();
    await store.set('short', 'x', 1);
    for (let index = 0; index < MEMORY_STORE_MAX_ENTRIES - 1; index += 1) {
      await store.set(`live-${index}`, 'v', 3600);
    }
    jest.advanceTimersByTime(2_000);

    await store.set('new', 'v', 3600);

    await expect(store.get('short')).resolves.toBeNull();
    await expect(store.get('live-0')).resolves.toBe('v');
    await expect(store.get('new')).resolves.toBe('v');
  });

  it('should drop the oldest entry when it is full of live ones, so memory stays bounded', async () => {
    const store = new MemoryIdempotencyStore();
    for (let index = 0; index < MEMORY_STORE_MAX_ENTRIES; index += 1) {
      await store.set(`live-${index}`, 'v', 3600);
    }

    await store.set('new', 'v', 3600);

    await expect(store.get('live-0')).resolves.toBeNull();
    await expect(store.get('live-1')).resolves.toBe('v');
    await expect(store.get('new')).resolves.toBe('v');
  });
});
