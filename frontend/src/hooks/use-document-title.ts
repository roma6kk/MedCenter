'use client';

import { useEffect } from 'react';
import { useT } from '@/lib/i18n/use-t';

export function useDocumentTitle(title: string | null, withBrand: boolean = true): void {
  const brand: string = useT('layout')('brand');
  useEffect(() => {
    if (title === null) return undefined;
    const previous: string = document.title;
    document.title = withBrand ? `${title} — ${brand}` : title;
    return () => {
      document.title = previous;
    };
  }, [title, brand, withBrand]);
}
