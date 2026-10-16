export interface PageMetaDto {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedResponseDto<TItem> {
  items: TItem[];
  meta: PageMetaDto;
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
/** Upper bound of `page`: a huge page becomes a huge HAPI `_offset` that the server would still have to scan. */
export const MAX_PAGE = 1000;

export function buildPaginatedResponse<TItem>(
  items: TItem[],
  meta: PageMetaDto,
): PaginatedResponseDto<TItem> {
  return { items, meta };
}