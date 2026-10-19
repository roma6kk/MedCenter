'use client';

import { useId } from 'react';
import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { PANEL_CLASS } from '../shared/admin-styles';
import { QueryState } from '../shared/query-state';
import type { MeasureReport } from './analytics-types';

interface ReportSectionProps<TReport extends MeasureReport> {
  readonly title: string;
  readonly query: Pick<UseQueryResult<TReport, Error>, 'data' | 'isPending' | 'isError' | 'error' | 'refetch'>;
  readonly emptyTitle: string;
  readonly children: (report: TReport) => ReactNode;
}

/** One report of the dashboard: its own heading, loading skeleton, error with «Повторить» and empty state. */
export function ReportSection<TReport extends MeasureReport>({ title, query, emptyTitle, children }: ReportSectionProps<TReport>): ReactNode {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={PANEL_CLASS}>
      <h2 id={headingId} className="serif text-lg font-semibold">{title}</h2>
      <div className="mt-3">
        <QueryState query={query} isEmpty={(report) => report.total === 0} emptyTitle={emptyTitle}>
          {children}
        </QueryState>
      </div>
    </section>
  );
}
