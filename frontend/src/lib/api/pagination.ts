/**
 * pagination — the shared list envelope of the API (api-designer-spec §0, `PaginatedResponseDto`).
 *
 * Every listing answers `{ items, meta }`; the shape is verified against the live stack. Services that
 * still answer a bare array are tolerated by `toPaginated` so one page does not crash on a legacy list.
 */

export interface PageMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export interface PaginatedResponse<TItem> {
  readonly items: ReadonlyArray<TItem>;
  readonly meta: PageMeta;
}

export type SortOrder = 'asc' | 'desc';

export interface PageParams {
  readonly page?: number;
  readonly pageSize?: number;
  readonly sortBy?: string;
  readonly sortOrder?: SortOrder;
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function isPageMeta(value: unknown): value is PageMeta {
  return (
    isRecord(value) &&
    isCount(value['page']) &&
    isCount(value['pageSize']) &&
    isCount(value['totalItems']) &&
    isCount(value['totalPages'])
  );
}

export function isPaginatedResponse(value: unknown): value is PaginatedResponse<unknown> {
  return isRecord(value) && Array.isArray(value['items']) && isPageMeta(value['meta']);
}

export function emptyPage<TItem>(pageSize: number = DEFAULT_PAGE_SIZE): PaginatedResponse<TItem> {
  return { items: [], meta: { page: DEFAULT_PAGE, pageSize, totalItems: 0, totalPages: 0 } };
}

/** Wraps a bare array in a single-page envelope; an envelope passes through unchanged. */
export function toPaginated<TItem>(value: PaginatedResponse<TItem> | ReadonlyArray<TItem>): PaginatedResponse<TItem> {
  if (!Array.isArray(value)) return value as PaginatedResponse<TItem>;
  const items = value as ReadonlyArray<TItem>;
  const pageSize: number = Math.max(items.length, 1);
  return { items, meta: { page: DEFAULT_PAGE, pageSize, totalItems: items.length, totalPages: items.length === 0 ? 0 : 1 } };
}

/** `page` clamped into 1…totalPages (an empty list still reports page 1 of 1 to the pager). */
export function pageLabel(meta: PageMeta): { readonly current: number; readonly total: number } {
  const total: number = Math.max(meta.totalPages, 1);
  return { current: Math.min(Math.max(meta.page, 1), total), total };
}
