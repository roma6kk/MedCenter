import { Global, Module } from '@nestjs/common';
import { IDEMPOTENCY_STORE, IdempotencyService } from '@medcenter/common';

import { idempotencyStoreProvider } from './idempotency-store.provider';
import { createRedisCacheStore, RedisCacheStore } from './redis-cache.store';
import { CACHE_STORE, RedisCacheService } from './redis-cache.service';

/**
 * Provides the single cache instance to every catalog module. Global on
 * purpose: services, schedules and slots all invalidate through the same
 * store, so a second instance would silently split the namespace.
 *
 * The concrete backend binds only when `REDIS_URL` is configured; without it
 * `RedisCacheService` degrades to always-miss (module-level, as in the tests that
 * boot `AppModule` directly). The service itself no longer starts without Redis:
 * `main.ts` installs the rate-limit store (`enableRateLimit`), which fails the boot
 * when `REDIS_URL` is missing.
 */
@Global()
@Module({
  providers: [
    RedisCacheService,
    {
      provide: CACHE_STORE,
      useFactory: (): RedisCacheStore | null => createRedisCacheStore(),
    },
    idempotencyStoreProvider,
    IdempotencyService,
  ],
  exports: [RedisCacheService, IdempotencyService, IDEMPOTENCY_STORE],
})
export class CacheModule {}
