import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@medcenter/contracts';

import { FHIR_ID_PATTERN } from '../../../common/fhir-id';

/** Upper bound on `page`, so a client cannot push HAPI into an unbounded `_offset` scan. */
const MAX_PAGE = 1000;

/**
 * `?doctorId=&active=&page=&pageSize=` of API §5.2.2. `doctorId` becomes `actor=PractitionerRole/{id}`
 * in a reference search: a comma would turn it into an OR over other roles, so it
 * must be a single FHIR id. `active` goes to HAPI as a token.
 */
export class ListSchedulesQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_PAGE,
    default: DEFAULT_PAGE,
    description: 'Page number',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  page?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    default: DEFAULT_PAGE_SIZE,
    description: 'Page size',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;

  @ApiPropertyOptional({
    description: 'PractitionerRole id whose schedules to list',
    pattern: FHIR_ID_PATTERN.source,
    example: '1042',
  })
  @IsOptional()
  @Matches(FHIR_ID_PATTERN, { message: 'doctorId must be a FHIR resource id' })
  doctorId?: string;

  @ApiPropertyOptional({
    enum: ['true', 'false'],
    description: 'Only active (true) or only deactivated (false) schedules',
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  active?: 'true' | 'false';
}
