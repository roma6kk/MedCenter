'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';

const CARD_COUNT = 6;

/** Placeholder of a catalog page while the server reads the API: a title bar and six cards (frontend-design-spec §C.1). */
export function CatalogSkeleton(): ReactNode {
  const t = useT('common');
  return (
    <div role="status" aria-busy="true" data-testid="catalog-skeleton" className="animate-pulse">
      <span className="sr-only">{t('loading')}</span>
      <div aria-hidden="true" className="h-9 w-64 rounded-[6px] bg-[var(--secondary)]" />
      <div aria-hidden="true" className="mt-6 grid gap-3 md:grid-cols-2">
        {Array.from({ length: CARD_COUNT }, (_, index) => (
          <div key={index} className="h-24 rounded-[8px] border border-[var(--border)] bg-[var(--secondary)]" />
        ))}
      </div>
    </div>
  );
}
