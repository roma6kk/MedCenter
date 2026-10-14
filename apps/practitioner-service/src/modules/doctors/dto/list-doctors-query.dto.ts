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
  @IsOptional()
  @Matches(FHIR_ID_PATTERN, { message: 'serviceId must be a FHIR resource id' })
  serviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TERM_LENGTH)
  specialty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TERM_LENGTH)
  search?: string;
}
