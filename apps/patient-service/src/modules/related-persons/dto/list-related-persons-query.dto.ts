import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@medcenter/contracts';

/** Upper bound on `page`, so a client cannot push HAPI into an unbounded `_offset` scan. */
export const MAX_PAGE = 1000;

/**
 * Paging of `GET /api/v1/patients/{id}/related` (API §0 conventions). Only
 * `page`/`pageSize` are declared, so the whitelisting pipe drops anything else
 * — including a `patient` parameter (ADR-013).
 */
export class ListRelatedPersonsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE, default: DEFAULT_PAGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  readonly page: number = DEFAULT_PAGE;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  readonly pageSize: number = DEFAULT_PAGE_SIZE;
}
