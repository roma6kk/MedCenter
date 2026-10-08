import { Module } from '@nestjs/common';
import { createFhirClientProvider } from '@medcenter/fhir';

import { DoctorsController } from './doctors.controller';
import { DoctorsService } from './doctors.service';

@Module({
  controllers: [DoctorsController],
  providers: [createFhirClientProvider(), DoctorsService],
  exports: [DoctorsService],
})
export class DoctorsModule {}
