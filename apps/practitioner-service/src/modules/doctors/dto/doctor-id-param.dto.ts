import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { FHIR_ID_PATTERN } from '@medcenter/common';

export class DoctorIdParamDto {
  @ApiProperty({ description: 'Practitioner id (FHIR id)', pattern: '^[A-Za-z0-9\\-.]{1,64}$' })
  @Matches(FHIR_ID_PATTERN, { message: 'id must be a FHIR resource id' })
  id!: string;
}
