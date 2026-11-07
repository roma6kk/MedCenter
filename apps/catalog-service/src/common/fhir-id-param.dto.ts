import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { FHIR_ID_PATTERN } from '@medcenter/common';

/** FHIR id grammar only: a comma would turn a reference search into an OR over other resources, a dots-only id would collapse the read URL. */
export class FhirIdParamDto {
  @ApiProperty({
    description: 'FHIR resource id of the path resource',
    pattern: FHIR_ID_PATTERN.source,
    example: '1042',
  })
  @Matches(FHIR_ID_PATTERN, { message: 'id must be a FHIR resource id' })
  id!: string;
}
