import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { FhirModule } from '../fhir/fhir.module';
import { MePatientController } from './me-patient.controller';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
  imports: [FhirModule, AccessModule],
  controllers: [MePatientController, PatientsController],
  providers: [PatientsService],
})
export class PatientsModule {}
