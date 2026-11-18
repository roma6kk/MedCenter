import { Module } from '@nestjs/common';
import { PatientReadAudit } from '@medcenter/fhir';

import { consentEnforcementProvider } from '../../common/consent/consent-gate';
import { FhirModule } from '../../common/fhir/fhir.module';
import { PatientAccessService } from '../history/patient-access.service';
import { TerminologyModule } from '../terminology/terminology.module';
import { EncounterOpeningService } from './encounter-opening.service';
import { EncountersController } from './encounters.controller';
import { EncountersService } from './encounters.service';

@Module({
  imports: [FhirModule, TerminologyModule],
  controllers: [EncountersController],
  providers: [EncounterOpeningService, EncountersService, consentEnforcementProvider, PatientAccessService, PatientReadAudit],
})
export class EncountersModule {}
