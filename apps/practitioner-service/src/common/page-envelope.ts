import { buildPaginatedResponse, type PaginatedResponseDto } from '@medcenter/contracts';

/**
 * Wraps one page in the API §0 `{ items, meta }` envelope.
 *
 * `totalItems` is the match count HAPI reported (`Bundle.total`) or, when the
 * store gave none, the count known up to this page — the honest lower bound.
 */
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
