import { Module } from '@nestjs/common';

import { IDEMPOTENCY_STORE, IdempotencyService } from './idempotency.service';
import { createRedisIdempotencyStore } from './redis-idempotency.store';

@Module({
  providers: [
    { provide: IDEMPOTENCY_STORE, useFactory: () => createRedisIdempotencyStore() },
    IdempotencyService,
  ],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
