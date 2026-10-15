import { Module } from '@nestjs/common';
import { createFhirClientProvider, FHIR_CLIENT } from '@medcenter/fhir';

/**
 * One HAPI client for the service (`FHIR_BASE_URL`, `FHIR_CLIENT_*` from the
 * environment). Shared by `users` (Patient provisioning) and `audit`.
 */
@Module({
  providers: [createFhirClientProvider()],
  exports: [FHIR_CLIENT],
})
export class FhirModule {}
