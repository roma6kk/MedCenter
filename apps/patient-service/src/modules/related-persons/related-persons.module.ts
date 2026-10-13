import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { FhirModule } from '../fhir/fhir.module';
import { RelatedPersonsController } from './related-persons.controller';
import { RelatedPersonsService } from './related-persons.service';

@Module({
  imports: [FhirModule, AccessModule],
  controllers: [RelatedPersonsController],
  providers: [RelatedPersonsService],
})
export class RelatedPersonsModule {}
