import { Module } from '@nestjs/common';

import { FhirModule } from '../../common/fhir/fhir.module';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';
import { PatientAccessService } from './patient-access.service';
import { PrescriptionsService } from './prescriptions.service';

@Module({
  imports: [FhirModule],
  controllers: [HistoryController],
  providers: [PatientAccessService, HistoryService, PrescriptionsService],
})
export class HistoryModule {}
