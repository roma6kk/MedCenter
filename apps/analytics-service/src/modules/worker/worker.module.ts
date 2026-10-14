import { Module } from '@nestjs/common';

import { parseWorkerEnv, WORKER_CONFIG, type WorkerConfig } from '../../config/analytics-env';
import { FhirModule } from '../shared/fhir.module';
import { AnalyticsWorker } from './analytics.worker';
import { DeliveryProcessor } from './delivery.processor';
import { IngestionService } from './ingestion.service';
import { READ_MODEL_WRITER, TypeOrmReadModelWriter } from './read-model.writer';
import { SpecialtyResolver } from './specialty.resolver';

/** Event-driven half of the read-model (architect §5: "analytics-worker по событиям"). */
@Module({
  imports: [FhirModule],
  providers: [
    { provide: WORKER_CONFIG, useFactory: (): WorkerConfig => parseWorkerEnv(process.env) },
    { provide: READ_MODEL_WRITER, useClass: TypeOrmReadModelWriter },
    SpecialtyResolver,
    IngestionService,
    DeliveryProcessor,
    AnalyticsWorker,
  ],
})
export class WorkerModule {}
