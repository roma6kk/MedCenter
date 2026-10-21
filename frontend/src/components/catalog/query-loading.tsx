'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';

/** A read in flight: pulsing placeholder rows with a text for screen readers. */
export function QueryLoading({ rows = 3 }: { readonly rows?: number }): ReactNode {
  const t = useT('common');
  return (
    <div role="status" aria-busy="true" data-testid="query-loading" className="animate-pulse space-y-2">
      <span className="sr-only">{t('loading')}</span>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} aria-hidden="true" className="h-14 rounded-[8px] bg-[var(--secondary)]" />
      ))}
    </div>
  );
}
