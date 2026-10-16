import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { MAX_PAGE_SIZE } from '@medcenter/contracts';

import { FHIR_ID_PATTERN } from '../../../common/fhir-id';

/** Upper bound on `page`, so a client cannot push HAPI into an unbounded `_offset` scan. */
const MAX_PAGE = 1000;

/**
 * `?doctorId=&active=&page=&pageSize=` of API §5.2.2. `doctorId` becomes `actor=PractitionerRole/{id}`
 * in a reference search: a comma would turn it into an OR over other roles, so it
 * must be a single FHIR id. `active` goes to HAPI as a token.
 */
export class ListSchedulesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;

  @IsOptional()
  @Matches(FHIR_ID_PATTERN, { message: 'doctorId must be a FHIR resource id' })
  doctorId?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  active?: 'true' | 'false';
}
