import { Module } from '@nestjs/common';
import { createFhirClientProvider, FHIR_CLIENT } from '@medcenter/fhir';

@Module({
  providers: [createFhirClientProvider()],
  exports: [FHIR_CLIENT],
})
export class FhirModule {}
