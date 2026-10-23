import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

import { FHIR_ID_PATTERN } from './fhir-id';

/**
 * `{id}` of a path that goes into a FHIR read or reference search (services,
 * schedules). Restricted to the FHIR id grammar: a comma would turn a
 * reference search into an OR over other resources, and a dots-only id would
 * collapse the FHIR read URL (`Schedule/..`).
 */
export class FhirIdParamDto {
  @ApiProperty({
    description: 'FHIR resource id of the path resource',
    pattern: FHIR_ID_PATTERN.source,
    example: '1042',
  })
  @Matches(FHIR_ID_PATTERN, { message: 'id must be a FHIR resource id' })
  id!: string;
}
