import { Module } from '@nestjs/common';
import { createEventPublisherProvider } from '@medcenter/messaging';

import { EncounterPublisherService } from './encounter-publisher.service';

@Module({
  providers: [createEventPublisherProvider(), EncounterPublisherService],
  exports: [EncounterPublisherService],
})
export class EventsModule {}
