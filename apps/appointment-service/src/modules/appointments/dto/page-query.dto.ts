import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@medcenter/contracts';

import type { PageQuery } from '../appointment-queries.service';

/** Upper bound on `page`, so a client cannot push HAPI into an unbounded `_offset` scan. */
export const MAX_PAGE = 1000;

/** Listing parameters shared by API §6.2 and §6.5 (API §0 pagination and sorting). */
export class PageQueryDto {
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

  /** Order by `Appointment.start`; `asc` by default (API §0). */
  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc', description: 'Sort by start' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

/** Applies the API §0 defaults to a validated listing query. */
export function toPageQuery(dto: PageQueryDto): PageQuery {
  return {
    page: dto.page ?? DEFAULT_PAGE,
    pageSize: dto.pageSize ?? DEFAULT_PAGE_SIZE,
    sortOrder: dto.sortOrder ?? 'asc',
  };
}
