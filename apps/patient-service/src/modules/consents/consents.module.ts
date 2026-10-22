import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { FhirModule } from '../fhir/fhir.module';
import { ConsentsController } from './consents.controller';
import { ConsentsService } from './consents.service';
import { MeConsentController } from './me-consent.controller';

@Module({
  imports: [FhirModule, AccessModule],
  controllers: [MeConsentController, ConsentsController],
  providers: [ConsentsService],
})
export class ConsentsModule {}
