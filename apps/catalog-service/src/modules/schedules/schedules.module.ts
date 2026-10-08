import { Module } from '@nestjs/common';
import { createFhirClientProvider } from '@medcenter/fhir';

import { CacheModule } from '../cache/cache.module';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { SlotGeneratorService } from './slot-generator.service';

@Module({
  imports: [CacheModule],
  controllers: [SchedulesController],
  providers: [createFhirClientProvider(), SchedulesService, SlotGeneratorService],
  exports: [SchedulesService, SlotGeneratorService],
})
export class SchedulesModule {}
