import { Global, Module } from '@nestjs/common';

import { createRedisCacheStore, RedisCacheStore } from './redis-cache.store';
import { CACHE_STORE, RedisCacheService } from './redis-cache.service';

/**
 * Provides the single cache instance to every catalog module. Global on
 * purpose: services, schedules and slots all invalidate through the same
 * store, so a second instance would silently split the namespace.
 *
 * The concrete backend binds only when `REDIS_URL` is configured; without it
 * `RedisCacheService` degrades to always-miss and the app still boots.
 */
@Global()
@Module({
  providers: [
    RedisCacheService,
    {
      provide: CACHE_STORE,
      useFactory: (): RedisCacheStore | null => createRedisCacheStore(),
    },
  ],
  exports: [RedisCacheService],
})
export class CacheModule {}
