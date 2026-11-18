import { Module } from '@nestjs/common';
import { createFhirClientProvider, PatientReadAudit } from '@medcenter/fhir';

import { IdempotencyModule } from '../idempotency/idempotency.module';
import { AdminAppointmentsController } from './admin-appointments.controller';
import { AppointmentQueriesService } from './appointment-queries.service';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { DoctorAppointmentsController } from './doctor-appointments.controller';

@Module({
  imports: [IdempotencyModule],
  controllers: [AppointmentsController, DoctorAppointmentsController, AdminAppointmentsController],
  providers: [createFhirClientProvider(), AppointmentsService, AppointmentQueriesService, PatientReadAudit],
})
export class AppointmentsModule {}
