'use client';

import { useEffect } from 'react';
import type { PaginatedResponse } from '@/lib/api/pagination';

/**
 * After the last row of the last page is deleted, the server still answers for that page: no rows, but earlier pages exist.
 * The list would say «пусто» with no pager although the records are one page back, so the list steps back to the last page
 * that has rows. Only the answer for the page that was asked for counts (not the previous page kept while loading).
 */
export function useStepBackWhenPageEmpty(data: PaginatedResponse<unknown> | undefined, requestedPage: number, goToPage: (page: number) => void): void {
  useEffect(() => {
    if (data === undefined || data.meta.page !== requestedPage) return;
    if (data.items.length === 0 && requestedPage > 1) goToPage(Math.max(1, Math.min(requestedPage - 1, data.meta.totalPages)));
  }, [data, requestedPage, goToPage]);
}
