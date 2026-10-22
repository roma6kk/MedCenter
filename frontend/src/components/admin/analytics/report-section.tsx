'use client';

import { useId } from 'react';
import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { QueryState } from '../shared/query-state';
import type { MeasureReport } from './analytics-types';

interface ReportSectionProps<TReport extends MeasureReport> {
  readonly title: string;
  readonly query: Pick<UseQueryResult<TReport, Error>, 'data' | 'isPending' | 'isError' | 'error' | 'errorUpdatedAt' | 'refetch'>;
  readonly emptyTitle: string;
  readonly children: (report: TReport) => ReactNode;
}

/** One report of the dashboard: its own heading, loading skeleton, error with «Повторить» and empty state. */
export function ReportSection<TReport extends MeasureReport>({ title, query, emptyTitle, children }: ReportSectionProps<TReport>): ReactNode {
  const headingId = useId();
  return (
    <Card as="section" radius="panel" padding="none" aria-labelledby={headingId} className="overflow-hidden pb-6">
      <h2 id={headingId} className="px-6 pb-3 pt-5 text-lg font-bold">{title}</h2>
      <div className="px-6">
        <QueryState query={query} isEmpty={(report) => report.total === 0} emptyTitle={emptyTitle}>
          {children}
        </QueryState>
      </div>
    </Card>
  );
}
