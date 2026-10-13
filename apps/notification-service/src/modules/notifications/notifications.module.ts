import { Module } from '@nestjs/common';
import { createFhirClientProvider } from '@medcenter/fhir';

import { ConsumerService } from './consumer.service';
import { DEDUP_STORE, DeduplicationService } from './deduplication.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { createRedisDedupStore } from './redis-dedup.store';

@Module({
  controllers: [NotificationsController],
  providers: [
    createFhirClientProvider(),
    { provide: DEDUP_STORE, useFactory: () => createRedisDedupStore() },
    DeduplicationService,
    ConsumerService,
    NotificationsService,
  ],
})
export class NotificationsModule {}
