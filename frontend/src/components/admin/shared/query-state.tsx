'use client';

import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { EmptyState, TableSkeleton } from '@/components/feedback/states';
import { useT } from '@/lib/i18n/use-t';

type QueryLike<TData> = Pick<UseQueryResult<TData, Error>, 'data' | 'isPending' | 'isError' | 'error' | 'errorUpdatedAt' | 'refetch'> &
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

/**
 * Loading skeleton → error banner with «Повторить» (it stays while the read is repeated, `QueryFailure`) → empty state → the
 * data, so every admin list handles the four states alike.
 */
export function QueryState<TData>({ query, isEmpty, emptyTitle, emptyDescription, emptyAction, children }: QueryStateProps<TData>): ReactNode {
  const tAdmin = useT('admin.common');
  if (query.data === undefined) return <QueryFailure query={query} embedded pending={<TableSkeleton />} />;
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
