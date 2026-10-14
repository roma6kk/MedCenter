import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_PAGE_SIZE } from '@medcenter/contracts';

/** Upper bound on `page`, so a client cannot push HAPI into an unbounded `_offset` scan. */
export const MAX_PAGE = 1000;

/**
 * `?page=&pageSize=` of API §0. Both become HAPI `_count`/`_offset`, so a value
 * that is not a whole number in range (`page=abc` is `NaN` after `Number()`) is
 * answered 400 here instead of surfacing as a HAPI error and a 500.
 */
export class PageQueryDto {
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
}
