import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  buildPaginatedResponse,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type PaginatedResponseDto,
} from '@medcenter/contracts';

/** Upper bound on `page`, so a client cannot push HAPI into an unbounded `_offset` scan. */
export const MAX_PAGE = 1000;

export type SortOrder = 'asc' | 'desc';

export interface PageQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly sortOrder: SortOrder;
}

/**
 * Listing parameters of API §7.4–7.7 (API §0 pagination). Clinical history is
 * read newest first, so `sortOrder` defaults to `desc` on these endpoints.
 */
export class PageQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: SortOrder;
}

export function toPageQuery(dto: PageQueryDto): PageQuery {
  return {
    page: dto.page ?? DEFAULT_PAGE,
    pageSize: dto.pageSize ?? DEFAULT_PAGE_SIZE,
    sortOrder: dto.sortOrder ?? 'desc',
  };
}

/** `_offset` of the first item of the page. */
export function pageOffset(query: PageQuery): number {
  return (query.page - 1) * query.pageSize;
}

/**
 * The API §0 envelope. Without a reported total the count is known up to this
 * page, which is the honest lower bound.
 */
export function toPage<TItem>(items: TItem[], total: number | undefined, query: PageQuery): PaginatedResponseDto<TItem> {
  const totalItems = total ?? pageOffset(query) + items.length;
  return buildPaginatedResponse(items, {
    page: query.page,
    pageSize: query.pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / query.pageSize),
  });
}
