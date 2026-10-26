'use client';

import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n/use-t';

/** A read in flight: shimmering placeholder rows with a text for screen readers. */
export function QueryLoading({ rows = 3 }: { readonly rows?: number }): ReactNode {
  const t = useT('common');
  return (
    <div role="status" aria-busy="true" data-testid="query-loading" className="space-y-2">
      <span className="sr-only">{t('loading')}</span>
      {Array.from({ length: rows }, (_, row) => (
        <Skeleton key={row} className="h-14 rounded-control" />
      ))}
    </div>
  );
}
