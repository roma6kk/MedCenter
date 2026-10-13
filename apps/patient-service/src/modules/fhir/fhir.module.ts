import { Module } from '@nestjs/common';
import { createFhirClientProvider, FHIR_CLIENT } from '@medcenter/fhir';

/**
 * One FHIR client per service instance (ADR-004/015), shared by every module
 * that reads HAPI. Tests swap it with `overrideProvider(FHIR_CLIENT)`.
 */
@Module({
  providers: [createFhirClientProvider()],
  exports: [FHIR_CLIENT],
})
export class FhirModule {}
