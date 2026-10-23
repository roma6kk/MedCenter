import { Module } from '@nestjs/common';
import { createFhirClientProvider } from '@medcenter/fhir';

import { IdempotencyModule } from '../idempotency/idempotency.module';
import { consentEnforcementProvider } from './consent-enforcement';
import { AppointmentQueriesService } from './appointment-queries.service';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { DoctorAppointmentsController } from './doctor-appointments.controller';

@Module({
  imports: [IdempotencyModule],
  controllers: [AppointmentsController, DoctorAppointmentsController],
  providers: [createFhirClientProvider(), consentEnforcementProvider, AppointmentsService, AppointmentQueriesService],
})
export class AppointmentsModule {}
