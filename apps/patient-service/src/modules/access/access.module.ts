import { Module } from '@nestjs/common';

import { FhirModule } from '../fhir/fhir.module';
import { PatientAccessService } from './patient-access.service';

@Module({
  imports: [FhirModule],
  providers: [PatientAccessService],
  exports: [PatientAccessService],
})
export class AccessModule {}
