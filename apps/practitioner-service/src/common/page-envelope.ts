import { buildPaginatedResponse, type PaginatedResponseDto } from '@medcenter/contracts';

// `totalItems` is `Bundle.total`, or the count known up to this page when HAPI gave none.
export function toPage<TItem>(
  items: TItem[],
  page: number,
  pageSize: number,
  totalItems: number | undefined,
): PaginatedResponseDto<TItem> {
  const total = totalItems ?? (page - 1) * pageSize + items.length;
  return buildPaginatedResponse(items, {
    page,
    pageSize,
    totalItems: total,
    totalPages: Math.ceil(total / pageSize),
  });
}
