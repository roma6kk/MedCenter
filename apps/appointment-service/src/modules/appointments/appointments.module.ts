import { Module } from '@nestjs/common';
import { createFhirClientProvider } from '@medcenter/fhir';

import { EventsModule } from '../events/events.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { AppointmentsController, DoctorAppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [EventsModule, IdempotencyModule],
  controllers: [AppointmentsController, DoctorAppointmentsController],
  providers: [createFhirClientProvider(), AppointmentsService],
})
export class AppointmentsModule {}
