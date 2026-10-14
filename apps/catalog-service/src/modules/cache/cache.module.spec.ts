import { Test } from '@nestjs/testing';

import { InMemoryCacheStore } from './__tests__/in-memory-cache-store';
import { CacheModule } from './cache.module';
import { CACHE_STORE, RedisCacheService } from './redis-cache.service';

describe('CacheModule', () => {
  it('should hand the CACHE_STORE provider to RedisCacheService when the module is compiled', async () => {
    // Arrange
    const store = new InMemoryCacheStore();
    await store.set('slots:sched-1:2026-11-02:2026-11-03:all', JSON.stringify(['cached']));
    const moduleRef = await Test.createTestingModule({ imports: [CacheModule] })
      .overrideProvider(CACHE_STORE)
      .useValue(store)
      .compile();
    const cache = moduleRef.get(RedisCacheService);
    const loader = jest.fn().mockResolvedValue(['fresh']);

    // Act
    const value = await cache.getOrLoad('slots:sched-1:2026-11-02:2026-11-03:all', 15, loader);

    // Assert — a store that never reaches the service makes every read a miss (NFR-005).
    expect(value).toEqual(['cached']);
    expect(loader).not.toHaveBeenCalled();
    await moduleRef.close();
  });

  it('should degrade to always-miss when the factory binds no store', async () => {
    // Arrange
    const moduleRef = await Test.createTestingModule({ imports: [CacheModule] })
      .overrideProvider(CACHE_STORE)
      .useValue(null)
      .compile();
    const cache = moduleRef.get(RedisCacheService);
    const loader = jest.fn().mockResolvedValue(['fresh']);

    // Act
    const value = await cache.getOrLoad('any-key', 15, loader);

    // Assert
    expect(value).toEqual(['fresh']);
    expect(loader).toHaveBeenCalledTimes(1);
    await moduleRef.close();
  });
});
