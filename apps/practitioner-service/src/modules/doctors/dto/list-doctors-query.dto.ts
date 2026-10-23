import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { FHIR_ID_PATTERN } from '../../../common/fhir-id';
import { PageQueryDto } from '../../../common/page-query.dto';

/** Longest `search`/`specialty` term accepted (unauthenticated input on a public route). */
export const MAX_TERM_LENGTH = 100;

/**
 * `GET /api/v1/doctors?serviceId=&specialty=&search=&page=&pageSize=` (API §4.1,
 * public). `serviceId` becomes `service=HealthcareService/{id}` in a reference
 * search, so a comma would OR in other services: it must be a single FHIR id.
 */
export class ListDoctorsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'HealthcareService id: only doctors who perform this service', pattern: '^[A-Za-z0-9\\-.]{1,64}$' })
  @IsOptional()
  @Matches(FHIR_ID_PATTERN, { message: 'serviceId must be a FHIR resource id' })
  serviceId?: string;

  @ApiPropertyOptional({ description: 'Specialty code or system|code, as in specialtyCode/specialtySystem of the response', maxLength: MAX_TERM_LENGTH, example: 'http://snomed.info/sct|419192003' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TERM_LENGTH)
  specialty?: string;

  @ApiPropertyOptional({ description: 'Name fragment of the doctor', maxLength: MAX_TERM_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TERM_LENGTH)
  search?: string;
}
