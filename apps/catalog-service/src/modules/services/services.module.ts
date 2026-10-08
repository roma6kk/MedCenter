import { Module } from '@nestjs/common';
import { createFhirClientProvider } from '@medcenter/fhir';

import { CacheModule } from '../cache/cache.module';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';

@Module({
  imports: [CacheModule],
  controllers: [ServicesController],
  providers: [createFhirClientProvider(), ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
