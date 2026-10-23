import { Module } from '@nestjs/common';

import { consentEnforcementProvider } from '../../common/consent/consent-gate';
import { FhirModule } from '../../common/fhir/fhir.module';
import { EventsModule } from '../events/events.module';
import { TerminologyModule } from '../terminology/terminology.module';
import { EncounterOpeningService } from './encounter-opening.service';
import { EncountersController } from './encounters.controller';
import { EncountersService } from './encounters.service';

@Module({
  imports: [FhirModule, TerminologyModule, EventsModule],
  controllers: [EncountersController],
  providers: [EncounterOpeningService, EncountersService, consentEnforcementProvider],
})
export class EncountersModule {}
