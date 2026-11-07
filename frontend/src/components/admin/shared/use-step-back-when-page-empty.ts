'use client';

import { useEffect } from 'react';
import type { PaginatedResponse } from '@/lib/api/pagination';

// After the last row of the last page is deleted the server answers an empty page; step back to the last page with rows. Only the answer for the requested page counts.
export function useStepBackWhenPageEmpty(data: PaginatedResponse<unknown> | undefined, requestedPage: number, goToPage: (page: number) => void): void {
  useEffect(() => {
    if (data === undefined || data.meta.page !== requestedPage) return;
    if (data.items.length === 0 && requestedPage > 1) goToPage(Math.max(1, Math.min(requestedPage - 1, data.meta.totalPages)));
  }, [data, requestedPage, goToPage]);
}
