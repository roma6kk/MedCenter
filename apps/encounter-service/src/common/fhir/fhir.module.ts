import { Module } from '@nestjs/common';
import { createFhirClientProvider, FHIR_CLIENT } from '@medcenter/fhir';

/** One FHIR client (HAPI, ADR-004/011) shared by every module of the service. */
@Module({
  providers: [createFhirClientProvider()],
  exports: [FHIR_CLIENT],
})
export class FhirModule {}
