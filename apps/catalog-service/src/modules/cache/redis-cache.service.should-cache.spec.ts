import { InMemoryCacheStore } from './__tests__/in-memory-cache-store';
import { RedisCacheService } from './redis-cache.service';

describe('RedisCacheService.getOrLoad shouldCache', () => {
  it('should return a value the predicate refuses without storing it, so the next read loads again', async () => {
    const store = new InMemoryCacheStore();
    const cache = new RedisCacheService(store);
    const loader = jest.fn().mockResolvedValue({ items: [] });

    const first = await cache.getOrLoad('k', 60, loader, (value: { items: unknown[] }) => value.items.length > 0);
    await cache.getOrLoad('k', 60, loader, (value: { items: unknown[] }) => value.items.length > 0);

    expect(first).toEqual({ items: [] });
    expect(store.entries.size).toBe(0);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('should store a value the predicate accepts and serve it from the store', async () => {
    const store = new InMemoryCacheStore();
    const cache = new RedisCacheService(store);
    const loader = jest.fn().mockResolvedValue({ items: [1] });

    await cache.getOrLoad('k', 60, loader, (value: { items: unknown[] }) => value.items.length > 0);
    await cache.getOrLoad('k', 60, loader, (value: { items: unknown[] }) => value.items.length > 0);

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('should store everything when no predicate is given', async () => {
    const store = new InMemoryCacheStore();
    const cache = new RedisCacheService(store);

    await cache.getOrLoad('k', 60, () => Promise.resolve([]));

    expect(store.entries.size).toBe(1);
  });
});
