import { Module } from '@nestjs/common';
import { createFhirClientProvider } from '@medcenter/fhir';

import { EventsModule } from '../events/events.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { AppointmentQueriesService } from './appointment-queries.service';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { DoctorAppointmentsController } from './doctor-appointments.controller';

@Module({
  imports: [EventsModule, IdempotencyModule],
  controllers: [AppointmentsController, DoctorAppointmentsController],
  providers: [createFhirClientProvider(), AppointmentsService, AppointmentQueriesService],
})
export class AppointmentsModule {}
