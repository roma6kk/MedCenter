import { Module } from '@nestjs/common';
import { createFhirClientProvider } from '@medcenter/fhir';

import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  controllers: [RoomsController],
  providers: [createFhirClientProvider(), RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
