import { Module } from '@nestjs/common';
import { createFhirClientProvider } from '@medcenter/fhir';

import { CacheModule } from '../cache/cache.module';
import { DoctorScheduleService } from './doctor-schedule.service';
import { DoctorSlotsService } from './doctor-slots.service';
import { SlotsController } from './slots.controller';

@Module({
  imports: [CacheModule],
  controllers: [SlotsController],
  providers: [createFhirClientProvider(), DoctorSlotsService, DoctorScheduleService],
})
export class SlotsModule {}
