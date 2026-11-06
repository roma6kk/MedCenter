'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Clock } from 'lucide-react';
import { Pager } from '@/components/data-display/paginated-table';
import { EmptyState } from '@/components/feedback/states';
import { StampBadge } from '@/components/feedback/stamp-badge';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button-variants';
import { formatClinicTime } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { useStaggerOnce } from '@/hooks/use-stagger-once';
import { cn } from '@/lib/ui/cn';
import type { DoctorJournalPage, JournalAppointment } from './doctor-types';
import { buildTimeline, canOpenPatientCard, countByStatus, findNextVisit, initialsOf, patientNameOf, visitMinutes, withNowLine, type GapEntry, type NowEntry, type StatusCounts, type TimelineEntry } from './journal-model';
import { NoshowMenu } from './noshow-menu';
import { OpenEncounterButton } from './open-encounter-button';
import { useNow } from './use-now';

function useDuration(): (minutes: number) => string {
  const t = useT('doctor.journal');
  return (minutes) => {
    const hours: number = Math.floor(minutes / 60);
    const rest: number = minutes % 60;
    if (hours === 0) return t('minutes', { count: rest });
    return rest === 0 ? t('hoursOnly', { hours }) : t('hoursMinutes', { hours, minutes: rest });
  };
}

function PatientLink({ visit, className }: { readonly visit: JournalAppointment; readonly className?: string }): ReactNode {
  const t = useT('doctor.journal');
  if (!canOpenPatientCard(visit.status)) {
    return <span className={className}>{patientNameOf(visit, t)}</span>;
  }
  return (
    <Link
      href={`/patients/${encodeURIComponent(visit.patientId)}`}
      title={t('patientCard')}
      data-row-anchor
      className={cn('rounded-sm underline-offset-2 hover:underline', className)}
    >
      {patientNameOf(visit, t)}
    </Link>
  );
}

function StatusChip({ status }: { readonly status: JournalAppointment['status'] }): ReactNode {
  // A no-show card is tinted like the warning badge: the badge stands on a white pill with a ring.
  return <span className="ml-auto"><StampBadge status={status} className={status === 'noshow' ? 'bg-card ring-1 ring-inset ring-warning' : undefined} /></span>;
}

function NextVisitCard({ visit }: { readonly visit: JournalAppointment }): ReactNode {
  const t = useT('doctor.journal');
  const name: string = patientNameOf(visit, t);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card border-2 border-primary bg-primary-soft p-4">
      <span aria-hidden="true" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">{initialsOf(name)}</span>
      <span className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
        <span className="text-sm font-semibold text-primary-soft-foreground">{t('nextPatient')}</span>
        <span className="text-lg font-bold [overflow-wrap:anywhere]"><PatientLink visit={visit} /></span>
        {visit.serviceName ? <span className="text-sm text-primary-soft-foreground">{visit.serviceName}</span> : null}
      </span>
    </div>
  );
}

function VisitCard({ visit }: { readonly visit: JournalAppointment }): ReactNode {
  const t = useT('doctor.journal');
  const name: string = patientNameOf(visit, t);
  const { status } = visit;
  if (status === 'booked') {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-border bg-card px-4 py-3">
        <span className="flex min-w-0 flex-1 basis-48 flex-col">
          <span className="font-semibold [overflow-wrap:anywhere]"><PatientLink visit={visit} /></span>
          {visit.serviceName ? <span className="text-sm text-muted-foreground">{visit.serviceName}</span> : null}
          {visit.reason ? <span className="text-sm text-muted-foreground">{visit.reason}</span> : null}
        </span>
        <span className="inline-flex flex-wrap items-center gap-2">
          <OpenEncounterButton appointmentId={visit.id} patientId={visit.patientId} start={visit.start} label={`${name}, ${formatClinicTime(visit.start)}`} />
          <NoshowMenu appointmentId={visit.id} patientName={name} start={visit.start} />
        </span>
      </div>
    );
  }
  const cardClass: string =
    status === 'noshow' ? 'rounded-card bg-warning-soft' : status === 'cancelled' ? 'rounded-card border border-dashed border-border text-muted-foreground' : 'rounded-card border border-border bg-card';
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3.5 gap-y-1 px-4 py-3', cardClass)}>
      <span className={status === 'cancelled' ? 'font-medium line-through' : 'font-semibold'}><PatientLink visit={visit} /></span>
      {visit.serviceName ? <span className="text-sm text-muted-foreground">{visit.serviceName}</span> : null}
      <StatusChip status={status} />
    </div>
  );
}

function GapLine({ gap }: { readonly gap: GapEntry }): ReactNode {
  const t = useT('doctor.journal');
  const duration = useDuration();
  return (
    <p className="flex items-center gap-2.5 rounded-card border border-dashed border-border bg-transparent px-4 py-2.5 text-sm text-muted-foreground">
      <Clock aria-hidden="true" className="size-4 shrink-0" />
      {t('gap', { duration: duration(gap.minutes) })}
    </p>
  );
}

function NowRow({ entry }: { readonly entry: NowEntry }): ReactNode {
  const t = useT('doctor.journal');
  return (
    <li data-testid="journal-now" className="grid grid-cols-[3.5rem_1.5rem_minmax(0,1fr)] items-center gap-x-3">
      <span className="tabular-nums text-base font-semibold text-primary">{formatClinicTime(entry.start)}</span>
      <span aria-hidden="true" className="flex justify-center">
        <span className="size-3.5 rounded-full bg-primary ring-4 ring-primary-soft" />
      </span>
      <div className="flex items-center gap-2.5 py-1">
        <span className="text-xs font-semibold uppercase text-primary-soft-foreground">{t('now')}</span>
        <span aria-hidden="true" className="h-0.5 flex-1 rounded-full bg-primary" />
      </div>
    </li>
  );
}

function TimelineRow({ entry, isFirst }: { readonly entry: Exclude<TimelineEntry, NowEntry>; readonly isFirst: boolean }): ReactNode {
  const isGap: boolean = entry.kind === 'gap';
  const status = entry.kind === 'visit' ? entry.visit.status : null;
  const isNext: boolean = entry.kind === 'visit' && entry.isNext;
  const quiet: boolean = isGap || status === 'cancelled';
  const instant: string = entry.kind === 'visit' ? entry.visit.start : entry.start;
  return (
    <li data-testid={entry.kind === 'visit' ? `journal-visit-${entry.visit.id}` : 'journal-gap'} className="grid grid-cols-[3.5rem_1.5rem_minmax(0,1fr)] gap-x-3">
      <span className={cn('tabular-nums pt-3.5 text-base font-medium', quiet && 'text-muted-foreground')}>{formatClinicTime(instant)}</span>
      <span aria-hidden="true" className="flex flex-col items-center">
        <span className={cn('h-4 w-0.5', isFirst ? 'bg-transparent' : 'bg-border')} />
        <span
          className={cn(
            'size-3.5 rounded-full border-[3px]',
            isNext ? 'border-primary-soft bg-primary' : status === 'noshow' ? 'border-warning-soft bg-warning' : 'border-border bg-card',
          )}
        />
        <span className="min-h-4 w-0.5 flex-1 bg-border" />
      </span>
      <div className="pb-2.5 pt-1.5">
        {entry.kind === 'gap' ? <GapLine gap={entry} /> : entry.isNext ? <NextVisitCard visit={entry.visit} /> : <VisitCard visit={entry.visit} />}
      </div>
    </li>
  );
}

function DetailCell({ term, children, wide }: { readonly term: string; readonly children: ReactNode; readonly wide?: boolean }): ReactNode {
  return (
    <div className={cn('rounded-control bg-background p-3', wide && 'col-span-2')}>
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="mt-0.5 text-sm font-semibold [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function NextPatientPanel({ visit }: { readonly visit: JournalAppointment }): ReactNode {
  const t = useT('doctor.journal');
  const name: string = patientNameOf(visit, t);
  const label = `${name}, ${formatClinicTime(visit.start)}`;
  return (
    <Card as="section" radius="panel" padding="lg" aria-labelledby="journal-next-title" className="flex flex-col gap-4">
      <div className="flex items-center gap-3.5">
        <span aria-hidden="true" className="inline-flex size-[60px] shrink-0 items-center justify-center rounded-full bg-primary-soft text-xl font-bold text-primary-soft-foreground">{initialsOf(name)}</span>
        <div className="min-w-0">
          <h2 id="journal-next-title" className="text-xl font-bold [overflow-wrap:anywhere]">{name}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('nextVisitAt', { time: formatClinicTime(visit.start) })}</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        {visit.serviceName ? <DetailCell term={t('columns.service')}>{visit.serviceName}</DetailCell> : null}
        <DetailCell term={t('duration')}><span className="tabular-nums font-medium">{t('minutes', { count: visitMinutes(visit) })}</span></DetailCell>
        {visit.reason ? <DetailCell term={t('columns.reason')} wide>{visit.reason}</DetailCell> : null}
      </dl>
      <OpenEncounterButton appointmentId={visit.id} patientId={visit.patientId} start={visit.start} label={label} size="lg" fullWidth />
      <div className="flex items-center gap-2.5">
        <Link href={`/patients/${encodeURIComponent(visit.patientId)}`} data-row-anchor className={cn(buttonVariants({ variant: 'secondary' }), 'flex-1')}>{t('patientCardLink')}</Link>
        <NoshowMenu appointmentId={visit.id} patientName={name} start={visit.start} />
      </div>
    </Card>
  );
}

const SUMMARY_ROWS: ReadonlyArray<{ readonly status: 'booked' | 'fulfilled' | 'noshow' | 'cancelled'; readonly labelKey: string; readonly swatch: string }> = [
  { status: 'booked', labelKey: 'summaryBooked', swatch: 'bg-primary' },
  { status: 'fulfilled', labelKey: 'summaryFulfilled', swatch: 'bg-success' },
  { status: 'noshow', labelKey: 'summaryNoshow', swatch: 'bg-warning' },
  { status: 'cancelled', labelKey: 'summaryCancelled', swatch: 'bg-destructive' },
];

function DaySummary({ counts }: { readonly counts: StatusCounts }): ReactNode {
  const t = useT('doctor.journal');
  return (
    <Card as="section" radius="panel" padding="lg" aria-labelledby="journal-summary-title" className="flex flex-col gap-3.5">
      <h2 id="journal-summary-title" className="text-lg font-bold">{t('summaryTitle')}</h2>
      <div
        role="img"
        aria-label={t('summaryAria', { total: counts.total, booked: counts.booked, fulfilled: counts.fulfilled, noshow: counts.noshow, cancelled: counts.cancelled })}
        className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-secondary"
      >
        {SUMMARY_ROWS.filter((row) => counts[row.status] > 0).map((row) => (
          <span key={row.status} className={row.swatch} style={{ width: `${(counts[row.status] / counts.total) * 100}%` }} />
        ))}
      </div>
      <ul className="flex flex-col gap-2.5 text-base">
        {SUMMARY_ROWS.map((row) => (
          <li key={row.status} className="flex items-center gap-2.5">
            <span aria-hidden="true" className={cn('size-3 rounded-sm', row.swatch)} />
            {t(row.labelKey)}
            <span className="tabular-nums ml-auto font-medium">{counts[row.status]}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

interface JournalDayViewProps {
  readonly data: DoctorJournalPage;
  readonly rows: ReadonlyArray<JournalAppointment>;
  readonly onPage: (page: number) => void;
  readonly emptyFilteredText: string;
  readonly empty: ReactNode;
  readonly isToday: boolean;
}

function useTimeline(rows: ReadonlyArray<JournalAppointment>, isToday: boolean): ReadonlyArray<TimelineEntry> {
  const now: number | null = useNow(60_000, isToday);
  const timeline: ReadonlyArray<TimelineEntry> = buildTimeline(rows);
  return isToday && now !== null && rows.length > 0 ? withNowLine(timeline, now) : timeline;
}

export function JournalDayView({ data, rows, onPage, emptyFilteredText, empty, isToday }: JournalDayViewProps): ReactNode {
  const t = useT('doctor.journal');
  const timeline: ReadonlyArray<TimelineEntry> = useTimeline(rows, isToday);
  const enter = useStaggerOnce();
  const next: JournalAppointment | undefined = findNextVisit(data.items);
  const last: JournalAppointment | undefined = rows.at(-1);
  const first: JournalAppointment | undefined = rows[0];
  return (
    <div className="flex flex-wrap items-start gap-6">
      <Card as="section" radius="panel" padding="lg" aria-labelledby="journal-timeline-title" className="flex min-w-0 flex-[999_1_28rem] flex-col gap-1.5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
          <h2 id="journal-timeline-title" className="text-lg font-bold">{t('timelineTitle')}</h2>
          <p className="text-sm text-muted-foreground">
            <span role="status">{t('total', { count: data.meta.totalItems })}</span>
            {first && last ? <span className="tabular-nums">{` · ${formatClinicTime(first.start)}–${formatClinicTime(last.end)}`}</span> : null}
          </p>
        </div>
        {data.items.length === 0 ? empty : null}
        {data.items.length > 0 && rows.length === 0 ? <EmptyState title={emptyFilteredText} /> : null}
        {timeline.length > 0 ? (
          <ol className={cn('flex flex-col', enter)}>
            {timeline.map((entry, index) =>
              entry.kind === 'now' ? <NowRow key="now" entry={entry} /> : <TimelineRow key={entry.kind === 'visit' ? entry.visit.id : `gap-${entry.start}`} entry={entry} isFirst={index === 0} />,
            )}
          </ol>
        ) : null}
        {data.meta.totalPages > 1 ? <Pager meta={data.meta} onPage={onPage} /> : null}
      </Card>
      {data.items.length > 0 ? (
        <div className="flex flex-[1_1_20rem] flex-col gap-4">
          {next ? <NextPatientPanel visit={next} /> : null}
          <DaySummary counts={countByStatus(data.items)} />
        </div>
      ) : null}
    </div>
  );
}
