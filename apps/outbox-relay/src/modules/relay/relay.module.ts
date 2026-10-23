import { Module } from '@nestjs/common';
import { createFhirClientProvider } from '@medcenter/fhir';
import { createEventPublisherProvider } from '@medcenter/messaging';

import { parseRelayConfig, RELAY_CONFIG } from './relay.config';
import { createRedisLockStore, LOCK_STORE } from './redis-lock';
import { RelayService } from './relay.service';

@Module({
  providers: [
    createFhirClientProvider(),
    createEventPublisherProvider(),
    { provide: LOCK_STORE, useFactory: () => createRedisLockStore() },
    { provide: RELAY_CONFIG, useFactory: () => parseRelayConfig() },
    RelayService,
  ],
})
export class RelayModule {}
