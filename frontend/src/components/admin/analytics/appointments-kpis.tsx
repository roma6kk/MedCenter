'use client';

import type { ReactNode } from 'react';
import { StampBadge } from '@/components/feedback/stamp-badge';
import { useT } from '@/lib/i18n/use-t';
import { statusCounts } from './analytics-math';
import { APPOINTMENT_STATUSES, type AppointmentsReport } from './analytics-types';

function Kpi({ value, children }: { readonly value: number; readonly children: ReactNode }): ReactNode {
  return (
    <div className="rounded-[6px] border border-[var(--border)] p-4" data-testid="kpi">
      <p className="serif text-3xl font-bold">{value}</p>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{children}</p>
    </div>
  );
}

/** 9.1 as KPI cards: the total and one card per appointment status, the status shown as its stamp. */
export function AppointmentsKpis({ report }: { readonly report: AppointmentsReport }): ReactNode {
  const t = useT('admin.analytics.appointments');
  const counts = statusCounts(report);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi value={report.total}>{t('total')}</Kpi>
      {APPOINTMENT_STATUSES.map((status) => (
        <Kpi key={status} value={counts[status]}>
          <StampBadge status={status}>{t(status)}</StampBadge>
        </Kpi>
      ))}
    </div>
  );
}
