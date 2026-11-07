import { Global, Module } from '@nestjs/common';
import { IDEMPOTENCY_STORE, IdempotencyService } from '@medcenter/common';

import { idempotencyStoreProvider } from './idempotency-store.provider';
import { createRedisCacheStore, RedisCacheStore } from './redis-cache.store';
import { CACHE_STORE, RedisCacheService } from './redis-cache.service';

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
