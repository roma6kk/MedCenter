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
  readonly isEmpty?: (data: TData) => boolean;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  readonly emptyAction?: ReactNode;
  readonly children: (data: TData) => ReactNode;
}

function StaleRegion({ isStale, children }: { readonly isStale: boolean; readonly children: ReactNode }): ReactNode {
  const tAdmin = useT('admin.common');
  return (
    <div aria-busy={isStale || undefined} className={isStale ? 'opacity-60' : undefined}>
      {isStale ? <p role="status" className="sr-only">{tAdmin('refreshing')}</p> : null}
      {children}
    </div>
  );
}

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
