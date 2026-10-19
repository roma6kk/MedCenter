'use client';

import { useEffect } from 'react';

/** Names the page in the tab and for screen readers (WCAG 2.4.2) and puts the previous title back when the page unmounts. */
export function useDocumentTitle(title: string, brand: string): void {
  useEffect(() => {
    const previous: string = document.title;
    document.title = `${title} — ${brand}`;
    return () => {
      document.title = previous;
    };
  }, [title, brand]);
}
