'use client';

import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { EmptyState, TableSkeleton } from '@/components/feedback/states';
import { useRetryCooldown } from '@/lib/api/use-retry-cooldown';
import { useT } from '@/lib/i18n/use-t';
import { AdminProblem } from './admin-problem';
import { SECONDARY_BUTTON_CLASS } from './admin-styles';
import { problemOf } from './problem-of';

type QueryLike<TData> = Pick<UseQueryResult<TData, Error>, 'data' | 'isPending' | 'isError' | 'error' | 'refetch'> &
  Partial<Pick<UseQueryResult<TData, Error>, 'isPlaceholderData'>>;

interface QueryStateProps<TData> {
  readonly query: QueryLike<TData>;
  /** `true` when the loaded data has nothing to list (an empty page, no rows). */
  readonly isEmpty?: (data: TData) => boolean;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  readonly emptyAction?: ReactNode;
  readonly children: (data: TData) => ReactNode;
}

/** «Повторить»; after a 429 it stays closed and counts the seconds of `Retry-After` (frontend-design-spec §5.4). */
function RetryButton({ error, onRetry }: { readonly error: unknown; readonly onRetry: () => void }): ReactNode {
  const t = useT('common');
  const tProblem = useT('feedback.problem');
  const cooldown: number = useRetryCooldown(problemOf(error));
  const handleClick = (): void => {
    if (cooldown === 0) onRetry();
  };
  return (
    <button type="button" onClick={handleClick} aria-disabled={cooldown > 0 || undefined} className={SECONDARY_BUTTON_CLASS}>
      {cooldown > 0 ? tProblem('retryAfter', { seconds: cooldown }) : t('retry')}
    </button>
  );
}

/**
 * While the list shows the previous page or filter (`keepPreviousData`) and the new one is still loading, the region is
 * `aria-busy` and dimmed, and a status line says so: the old rows must not pass for the answer to the new request.
 */
function StaleRegion({ isStale, children }: { readonly isStale: boolean; readonly children: ReactNode }): ReactNode {
  const tAdmin = useT('admin.common');
  return (
    <div aria-busy={isStale || undefined} className={isStale ? 'opacity-60' : undefined}>
      {isStale ? <p role="status" className="sr-only">{tAdmin('refreshing')}</p> : null}
      {children}
    </div>
  );
}

/** Loading skeleton → error banner with «Повторить» → empty state → the data, so every admin list handles the four states alike. */
export function QueryState<TData>({ query, isEmpty, emptyTitle, emptyDescription, emptyAction, children }: QueryStateProps<TData>): ReactNode {
  const tAdmin = useT('admin.common');
  if (query.isPending) return <TableSkeleton />;
  if (query.isError || query.data === undefined) {
    return (
      <div className="grid gap-2">
        <AdminProblem error={query.error} />
        <div>
          <RetryButton error={query.error} onRetry={() => void query.refetch()} />
        </div>
      </div>
    );
  }
  const isStale: boolean = query.isPlaceholderData === true;
  if (isEmpty?.(query.data) === true) {
    return (
      <StaleRegion isStale={isStale}>
        <EmptyState title={emptyTitle ?? tAdmin('empty')} {...(emptyDescription === undefined ? {} : { description: emptyDescription })} {...(emptyAction === undefined ? {} : { action: emptyAction })} />
      </StaleRegion>
    );
  }
  return <StaleRegion isStale={isStale}>{children(query.data)}</StaleRegion>;
}
