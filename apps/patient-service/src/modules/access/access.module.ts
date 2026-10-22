import { Module } from '@nestjs/common';

import { FhirModule } from '../fhir/fhir.module';
import { PatientReadAudit } from '@medcenter/fhir';

import { PatientAccessService } from './patient-access.service';

@Module({
  imports: [FhirModule],
  providers: [PatientAccessService, PatientReadAudit],
  exports: [PatientAccessService, PatientReadAudit],
})
export class AccessModule {}
