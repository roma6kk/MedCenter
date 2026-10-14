import { Module } from '@nestjs/common';

import { FhirModule } from '../../common/fhir/fhir.module';
import { EventsModule } from '../events/events.module';
import { TerminologyModule } from '../terminology/terminology.module';
import { EncountersController } from './encounters.controller';
import { EncountersService } from './encounters.service';

@Module({
  imports: [FhirModule, TerminologyModule, EventsModule],
  controllers: [EncountersController],
  providers: [EncountersService],
})
export class EncountersModule {}
