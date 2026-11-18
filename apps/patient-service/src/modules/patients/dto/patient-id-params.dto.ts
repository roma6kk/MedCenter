import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { FHIR_ID_PATTERN } from '@medcenter/common';

export class PatientIdParamsDto {
  @ApiProperty({ description: 'Patient id (FHIR id)', pattern: '^[A-Za-z0-9\\-.]{1,64}$', example: '1234' })
  @Matches(FHIR_ID_PATTERN, { message: 'id must be a FHIR resource id ([A-Za-z0-9-.]{1,64})' })
  readonly id!: string;
}
