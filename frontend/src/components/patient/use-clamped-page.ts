'use client';

import { useEffect } from 'react';
import type { PageMeta } from '@/lib/api/pagination';

export function useClampedPage(meta: PageMeta | undefined, page: number, setPage: (page: number) => void): void {
  useEffect(() => {
    if (meta === undefined || page <= 1) return;
    const last: number = Math.max(meta.totalPages, 1);
    if (page > last) setPage(last);
  }, [meta, page, setPage]);
}
