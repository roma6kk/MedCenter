import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { FHIR_ID_PATTERN } from '@medcenter/common';

export class DoctorIdParamDto {
  @ApiProperty({
    description: 'Practitioner id (FHIR id)',
    pattern: FHIR_ID_PATTERN.source,
    example: '1042',
  })
  @Matches(FHIR_ID_PATTERN, { message: 'id must be a FHIR resource id' })
  id!: string;
}
