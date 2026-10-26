'use client';

import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n/use-t';

const CARD_COUNT = 6;

/** Placeholder of a catalog page while the server reads the API: a title bar and six cards (frontend-design-spec §C.1). */
export function CatalogSkeleton(): ReactNode {
  const t = useT('common');
  return (
    <div role="status" aria-busy="true" data-testid="catalog-skeleton">
      <span className="sr-only">{t('loading')}</span>
      <Skeleton className="h-9 w-64" />
      <div aria-hidden="true" className="mt-6 grid gap-3 md:grid-cols-2">
        {Array.from({ length: CARD_COUNT }, (_, index) => (
          <div key={index} aria-hidden="true" className="flex h-24 items-center gap-4 rounded-card border border-border-soft p-4">
            <Skeleton shape="circle" className="size-14 shrink-0" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
