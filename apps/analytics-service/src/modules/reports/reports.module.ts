import { Module } from '@nestjs/common';

import { CLOCK, systemClock } from '../shared/clock';
import { FhirModule } from '../shared/fhir.module';
import { CLINICAL_REPORT_SOURCE, FhirClinicalReportSource } from './clinical-report.source';
import { ReportsController } from './reports.controller';
import { REPORTS_REPOSITORY, TypeOrmReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

@Module({
  imports: [FhirModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    { provide: REPORTS_REPOSITORY, useClass: TypeOrmReportsRepository },
    { provide: CLINICAL_REPORT_SOURCE, useClass: FhirClinicalReportSource },
    { provide: CLOCK, useValue: systemClock },
  ],
})
export class ReportsModule {}
