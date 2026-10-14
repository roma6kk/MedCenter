import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { MAX_PAGE_SIZE } from '@medcenter/contracts';

import { DateRangeQueryDto } from '../../shared/date-range-query.dto';

/** `Appointment` (any resource of the type) or `Appointment/{id}` (one resource). */
export const ENTITY_FILTER_PATTERN = /^[A-Z][A-Za-z]{1,63}(\/[A-Za-z0-9\-.]{1,64})?$/;

/** The token `sub` (a UUID) or a literal agent reference such as `PractitionerRole/{id}`. */
export const USER_ID_FILTER_PATTERN = /^[A-Za-z0-9\-._:@/]{1,128}$/;

/** Deep offsets are refused: the journal is filtered by period, not paged to the end of time. */
export const MAX_AUDIT_PAGE = 10_000;

/** API §9.4 — `?from=&to=&entity=&userId=&page=&pageSize=`. */
export class AuditQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @Matches(ENTITY_FILTER_PATTERN, { message: 'entity must be a resource type or a Type/id reference' })
  readonly entity?: string;

  @IsOptional()
  @Matches(USER_ID_FILTER_PATTERN, { message: 'userId contains unsupported characters' })
  readonly userId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_AUDIT_PAGE)
  readonly page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  readonly pageSize?: number;
}
