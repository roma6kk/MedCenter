import { Module } from '@nestjs/common';
import { createFhirClientProvider } from '@medcenter/fhir';

import { RoomUsageService } from './room-usage.service';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  controllers: [RoomsController],
  providers: [createFhirClientProvider(), RoomsService, RoomUsageService],
  exports: [RoomsService],
})
export class RoomsModule {}
