import { Module } from '@nestjs/common';
import { createEventPublisherProvider } from '@medcenter/messaging';

import { AppointmentPublisherService } from './appointment-publisher.service';

@Module({
  providers: [createEventPublisherProvider(), AppointmentPublisherService],
  exports: [AppointmentPublisherService],
})
export class EventsModule {}
