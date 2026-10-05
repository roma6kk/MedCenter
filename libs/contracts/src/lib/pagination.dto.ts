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

export function buildPaginatedResponse<TItem>(
  items: TItem[],
  meta: PageMetaDto,
): PaginatedResponseDto<TItem> {
  return { items, meta };
}