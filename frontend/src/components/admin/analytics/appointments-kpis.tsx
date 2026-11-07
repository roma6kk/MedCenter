'use client';

import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { StampBadge } from '@/components/feedback/stamp-badge';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { deltaOf, deltaTone, type DeltaDirection, type DeltaTone } from './analytics-delta';
import { sharePercent, statusCounts } from './analytics-math';
import type { PeriodPreset } from './analytics-period';
import { APPOINTMENT_STATUSES, type AppointmentStatusCode, type AppointmentsReport } from './analytics-types';

const DELTA_ICON: Readonly<Record<DeltaDirection, LucideIcon>> = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight };

const DELTA_TONE_CLASS: Readonly<Record<DeltaTone, string>> = {
  good: 'text-success',
  bad: 'text-destructive',
  neutral: 'text-muted-foreground',
};

interface DeltaLineProps {
  readonly kind: AppointmentStatusCode | 'total';
  readonly current: number;
  readonly previous: number;
  readonly preset: PeriodPreset;
}

function DeltaLine({ kind, current, previous, preset }: DeltaLineProps): ReactNode {
  const t = useT('admin.analytics.kpi');
  const delta = deltaOf(current, previous);
  const Icon: LucideIcon = DELTA_ICON[delta.direction];
  const sign: string = delta.direction === 'up' ? '+' : delta.direction === 'down' ? '−' : '';
  const amount: string = delta.direction === 'flat' ? t('flat') : `${sign}${Math.abs(delta.change)}${delta.percent === null ? '' : ` (${sign}${delta.percent}%)`}`;
  return (
    <p data-testid="kpi-delta" className={cn('flex items-start gap-1 text-sm font-medium leading-snug', DELTA_TONE_CLASS[deltaTone(kind, delta.direction)])}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 flex-none" strokeWidth={2.25} />
      <span>
        {delta.direction === 'flat' ? null : <span className="sr-only">{t(`direction.${delta.direction}`)} </span>}
        {amount}
        <span className="font-normal text-muted-foreground"> {t(`vs.${preset}`)}</span>
      </span>
    </p>
  );
}

interface KpiProps {
  readonly kind: AppointmentStatusCode | 'total';
  readonly value: number;
  readonly total: number;
  readonly previous: number | undefined;
  readonly previousPending: boolean;
  readonly preset: PeriodPreset;
}

function Kpi({ kind, value, total, previous, previousPending, preset }: KpiProps): ReactNode {
  const t = useT('admin.analytics.appointments');
  const tKpi = useT('admin.analytics.kpi');
  return (
    <Card as="article" padding="md" data-testid="kpi" className="flex flex-col gap-2">
      {kind === 'total' ? <Badge tone="neutral">{t('total')}</Badge> : <StampBadge status={kind}>{t(kind)}</StampBadge>}
      <p className="text-4xl font-bold leading-none">{value}</p>
      <p className="min-h-5 text-sm text-muted-foreground">{kind === 'total' ? tKpi('period') : tKpi('share', { percent: sharePercent(value, total) })}</p>
      {previous !== undefined ? <DeltaLine kind={kind} current={value} previous={previous} preset={preset} /> : previousPending ? <Skeleton className="h-5 w-3/4" /> : null}
    </Card>
  );
}

interface AppointmentsKpisProps {
  readonly report: AppointmentsReport;
  readonly previous: AppointmentsReport | undefined;
  readonly previousPending: boolean;
  readonly preset: PeriodPreset;
}

export function AppointmentsKpis({ report, previous, previousPending, preset }: AppointmentsKpisProps): ReactNode {
  const counts = statusCounts(report);
  const before = previous === undefined ? undefined : statusCounts(previous);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Kpi kind="total" value={report.total} total={report.total} previous={previous?.total} previousPending={previousPending} preset={preset} />
      {APPOINTMENT_STATUSES.map((status) => (
        <Kpi key={status} kind={status} value={counts[status]} total={report.total} previous={before?.[status]} previousPending={previousPending} preset={preset} />
      ))}
    </div>
  );
}
