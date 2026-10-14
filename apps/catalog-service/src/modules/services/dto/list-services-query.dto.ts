import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MAX_PAGE_SIZE } from '@medcenter/contracts';

/** Upper bound on `page`, so a client cannot push HAPI into an unbounded `_offset` scan. */
export const MAX_PAGE = 1000;

/** Longest `search` term accepted (the value is unauthenticated input on a public route). */
export const MAX_SEARCH_LENGTH = 100;

/** API §5.1.1 `GET /api/v1/services?page=&pageSize=&search=` (API §0 pagination). */
export class ListServicesQueryDto {
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
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string;
}
