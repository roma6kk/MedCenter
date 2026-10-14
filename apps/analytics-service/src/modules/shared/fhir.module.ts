import { Module } from '@nestjs/common';
import { createFhirClientProvider, FHIR_CLIENT } from '@medcenter/fhir';

/** One read-only HAPI client for the reports, the journal sync and the worker. */
@Module({
  providers: [createFhirClientProvider()],
  exports: [FHIR_CLIENT],
})
export class FhirModule {}
