'use client';

import { useEffect } from 'react';
import type { PageMeta } from '@/lib/api/pagination';

/**
 * Pulls the page back into range when the list shrank under the viewer (the last unread notification of page 3 was read,
 * the last upcoming appointment of page 2 was cancelled): without it the viewer would stare at an empty page 3 of 2.
 */
export function useClampedPage(meta: PageMeta | undefined, page: number, setPage: (page: number) => void): void {
  useEffect(() => {
    if (meta === undefined || page <= 1) return;
    const last: number = Math.max(meta.totalPages, 1);
    if (page > last) setPage(last);
  }, [meta, page, setPage]);
}
