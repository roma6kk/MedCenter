import { Module } from '@nestjs/common';

import { FhirModule } from '../../common/fhir/fhir.module';
import { TerminologyValidatorService } from './terminology-validator.service';

@Module({
  imports: [FhirModule],
  providers: [TerminologyValidatorService],
  exports: [TerminologyValidatorService],
})
export class TerminologyModule {}
