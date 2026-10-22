'use client';

import type { ReactNode } from 'react';
import { StampBadge } from '@/components/feedback/stamp-badge';
import { cn } from '@/lib/ui/cn';
import { useT } from '@/lib/i18n/use-t';
import { statusCounts } from './analytics-math';
import { APPOINTMENT_STATUSES, type AppointmentStatusCode, type AppointmentsReport } from './analytics-types';

const SEGMENT_CLASS: Record<AppointmentStatusCode, string> = {
  booked: 'bg-primary text-primary-foreground',
  cancelled: 'bg-destructive text-white',
  noshow: 'bg-warning text-white',
};

/** Below this share a segment is too narrow for its caption; the cards under the bar carry the same numbers. */
const CAPTION_MIN_PERCENT = 14;

function StatusBar({ report }: { readonly report: AppointmentsReport }): ReactNode {
  const t = useT('admin.analytics.appointments');
  const counts = statusCounts(report);
  const sum = APPOINTMENT_STATUSES.reduce((total, status) => total + counts[status], 0);
  return (
    <div role="img" aria-label={t('barLabel', counts)} className="flex h-14 gap-[3px] overflow-hidden rounded-control">
      {APPOINTMENT_STATUSES.filter((status) => counts[status] > 0).map((status) => (
        <div
          key={status}
          data-testid={`bar-${status}`}
          style={{ flex: `${counts[status]} 1 0`, minWidth: 6 }}
          className={cn('flex min-w-0 items-center px-3.5 text-[15px] font-semibold', SEGMENT_CLASS[status])}
        >
          {(counts[status] * 100) / sum >= CAPTION_MIN_PERCENT ? <span className="truncate">{`${t(status)} · ${counts[status]}`}</span> : null}
        </div>
      ))}
    </div>
  );
}

function Kpi({ value, children }: { readonly value: number; readonly children: ReactNode }): ReactNode {
  return (
    <div className="rounded-card bg-[var(--secondary)] p-4" data-testid="kpi">
      <p className="serif text-3xl font-bold">{value}</p>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{children}</p>
    </div>
  );
}

/** 9.1: the share of every status as one bar, then the total and one card per appointment status (shown as its stamp). */
export function AppointmentsKpis({ report }: { readonly report: AppointmentsReport }): ReactNode {
  const t = useT('admin.analytics.appointments');
  const counts = statusCounts(report);
  return (
    <div className="grid gap-4">
      <StatusBar report={report} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi value={report.total}>{t('total')}</Kpi>
        {APPOINTMENT_STATUSES.map((status) => (
          <Kpi key={status} value={counts[status]}>
            <StampBadge status={status}>{t(status)}</StampBadge>
          </Kpi>
        ))}
      </div>
    </div>
  );
}
