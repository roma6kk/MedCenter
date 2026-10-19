'use client';

import type { ReactNode } from 'react';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { isApiError } from '@/lib/api/api-fetch';
import { useT } from '@/lib/i18n/use-t';
import { SECONDARY_BUTTON_CLASS } from './catalog-styles';

interface QueryFailedProps {
  /** What the query threw: an `ApiError` carries the real problem (code, request id); anything else is a generic failure. */
  readonly error: unknown;
  readonly onRetry: () => void;
}

/** A failed read: the real problem of the response in a banner, and a button to ask again. */
export function QueryFailed({ error, onRetry }: QueryFailedProps): ReactNode {
  const t = useT('common');
  return (
    <div className="space-y-2">
      {isApiError(error) ? <ProblemBanner problem={error.problem} /> : <ProblemBanner errorCode="INTERNAL" />}
      <button type="button" onClick={onRetry} className={SECONDARY_BUTTON_CLASS}>{t('retry')}</button>
    </div>
  );
}

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
