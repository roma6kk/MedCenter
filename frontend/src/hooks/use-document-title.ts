'use client';

import { useEffect } from 'react';
import { useT } from '@/lib/i18n/use-t';

/**
 * Names the page in the tab, in the language of the interface (WCAG 2.4.2): «Мои записи — Лайфлайн». The server renders
 * the Russian title from the same catalogue (`pageMetadata`), so a visitor without scripts gets one too; this hook takes
 * over after hydration, follows the language switch and puts the previous title back when the page unmounts.
 * `withBrand = false` is for the home page, whose title already is the clinic's name.
 */
export function useDocumentTitle(title: string, withBrand: boolean = true): void {
  const brand: string = useT('layout')('brand');
  useEffect(() => {
    const previous: string = document.title;
    document.title = withBrand ? `${title} — ${brand}` : title;
    return () => {
      document.title = previous;
    };
  }, [title, brand, withBrand]);
}
