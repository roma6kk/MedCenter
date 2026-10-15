import { Module } from '@nestjs/common';

import { FhirModule } from '../fhir/fhir.module';
import { AuditService } from './audit.service';

@Module({
  imports: [FhirModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
