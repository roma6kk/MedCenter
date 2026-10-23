'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Clock } from 'lucide-react';
import { Pager } from '@/components/data-display/paginated-table';
import { EmptyState } from '@/components/feedback/states';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button-variants';
import { formatClinicTime } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import type { DoctorJournalPage, JournalAppointment } from './doctor-types';
import { buildTimeline, canOpenPatientCard, countByStatus, findNextVisit, initialsOf, visitMinutes, type GapEntry, type StatusCounts, type TimelineEntry } from './journal-model';
import { NoshowButton } from './noshow-button';
import { OpenEncounterButton } from './open-encounter-button';

type Translate = (key: string, values?: Record<string, string | number>) => string;

function useDuration(): (minutes: number) => string {
  const t = useT('doctor.journal');
  return (minutes) => {
    const hours: number = Math.floor(minutes / 60);
    const rest: number = minutes % 60;
    if (hours === 0) return t('minutes', { count: rest });
    return rest === 0 ? t('hoursOnly', { hours }) : t('hoursMinutes', { hours, minutes: rest });
  };
}

function patientNameOf(visit: JournalAppointment, t: Translate): string {
  return visit.patientName ?? t('unknownPatient', { id: visit.patientId });
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

function StatusChip({ status, className }: { readonly status: JournalAppointment['status']; readonly className: string }): ReactNode {
  const t = useT('stamp');
  return <span data-testid={`stamp-${status}`} className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', className)}>{t(status)}</span>;
}

/** The card of the visit that comes next: the doctor's eye lands here first. Its actions live in the panel beside the timeline. */
function NextVisitCard({ visit }: { readonly visit: JournalAppointment }): ReactNode {
  const t = useT('doctor.journal');
  const name: string = patientNameOf(visit, t);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card border-2 border-primary bg-primary-soft p-4">
      <span aria-hidden="true" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">{initialsOf(name)}</span>
      <span className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
        <span className="text-xs font-bold uppercase tracking-[0.06em] text-primary-soft-foreground">{t('nextPatient')}</span>
        <span className="text-[17px] font-bold [overflow-wrap:anywhere]"><PatientLink visit={visit} /></span>
        {visit.serviceName ? <span className="text-sm text-primary-soft-foreground">{visit.serviceName}</span> : null}
      </span>
    </div>
  );
}

/** A visit of the day that is not "next": booked ones carry their actions, every other state only says what happened. */
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
          <OpenEncounterButton appointmentId={visit.id} patientId={visit.patientId} label={`${name}, ${formatClinicTime(visit.start)}`} />
          <NoshowButton appointmentId={visit.id} patientName={name} />
        </span>
      </div>
    );
  }
  const base = 'flex flex-wrap items-center gap-x-3.5 gap-y-1 px-4 py-3';
  const detail: ReactNode = visit.serviceName ? <span className="text-sm text-muted-foreground">{visit.serviceName}</span> : null;
  if (status === 'noshow') {
    return (
      <div className={cn(base, 'rounded-card bg-warning-soft')}>
        <span className="font-semibold"><PatientLink visit={visit} /></span>
        {detail}
        <StatusChip status={status} className="ml-auto bg-card text-warning" />
      </div>
    );
  }
  if (status === 'cancelled') {
    return (
      <div className={cn(base, 'rounded-card border border-dashed border-border text-muted-foreground')}>
        <span className="font-medium line-through"><PatientLink visit={visit} /></span>
        {detail}
        <StatusChip status={status} className="ml-auto text-destructive" />
      </div>
    );
  }
  return (
    <div className={cn(base, 'rounded-card border border-border bg-card')}>
      <span className="font-semibold"><PatientLink visit={visit} /></span>
      {detail}
      <StatusChip status={status} className="ml-auto bg-success-soft text-success" />
    </div>
  );
}

function GapLine({ gap }: { readonly gap: GapEntry }): ReactNode {
  const t = useT('doctor.journal');
  const duration = useDuration();
  return (
    <p className="flex items-center gap-2.5 rounded-card bg-background px-4 py-3.5 text-sm text-muted-foreground">
      <Clock aria-hidden="true" className="size-4 shrink-0" />
      {t('gap', { duration: duration(gap.minutes) })}
    </p>
  );
}

/** One row of the timeline: the time, the rail with its dot and the card. */
function TimelineRow({ entry, isFirst }: { readonly entry: TimelineEntry; readonly isFirst: boolean }): ReactNode {
  const isGap: boolean = entry.kind === 'gap';
  const status = entry.kind === 'visit' ? entry.visit.status : null;
  const isNext: boolean = entry.kind === 'visit' && entry.isNext;
  const quiet: boolean = isGap || status === 'cancelled';
  const instant: string = entry.kind === 'visit' ? entry.visit.start : entry.start;
  return (
    <li data-testid={entry.kind === 'visit' ? `journal-visit-${entry.visit.id}` : 'journal-gap'} className="grid grid-cols-[3.5rem_1.5rem_minmax(0,1fr)] gap-x-3">
      <span className={cn('mono pt-3.5 text-[15px] font-medium', quiet && 'text-muted-foreground')}>{formatClinicTime(instant)}</span>
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
    <div className={cn('rounded-[12px] bg-background p-3', wide && 'col-span-2')}>
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="mt-0.5 text-sm font-semibold [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/** Side panel of the next patient with the actions that exist today: open the visit, the patient card, no-show. */
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
        <DetailCell term={t('duration')}><span className="mono font-medium">{t('minutes', { count: visitMinutes(visit) })}</span></DetailCell>
        {visit.reason ? <DetailCell term={t('columns.reason')} wide>{visit.reason}</DetailCell> : null}
      </dl>
      <OpenEncounterButton appointmentId={visit.id} patientId={visit.patientId} label={label} size="lg" fullWidth />
      <div className="grid grid-cols-2 gap-2.5">
        <Link href={`/patients/${encodeURIComponent(visit.patientId)}`} data-row-anchor className={buttonVariants({ variant: 'secondary' })}>{t('patientCardLink')}</Link>
        <NoshowButton appointmentId={visit.id} patientName={name} className="w-full" />
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

/** "Итоги дня": a status bar (one segment per state that occurs) and the counts under it. */
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
      <ul className="flex flex-col gap-2.5 text-[15px]">
        {SUMMARY_ROWS.map((row) => (
          <li key={row.status} className="flex items-center gap-2.5">
            <span aria-hidden="true" className={cn('size-2.5 rounded-[3px]', row.swatch)} />
            {t(row.labelKey)}
            <span className="mono ml-auto font-medium">{counts[row.status]}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

interface JournalDayViewProps {
  readonly data: DoctorJournalPage;
  /** The loaded rows that pass the status filter. */
  readonly rows: ReadonlyArray<JournalAppointment>;
  readonly onPage: (page: number) => void;
  /** Empty-result message when the filter hides everything. */
  readonly emptyFilteredText: string;
  readonly emptyText: string;
}

/** Day view: the timeline of the day's visits and, beside it, the next patient and the summary of the day. */
export function JournalDayView({ data, rows, onPage, emptyFilteredText, emptyText }: JournalDayViewProps): ReactNode {
  const t = useT('doctor.journal');
  const timeline: ReadonlyArray<TimelineEntry> = buildTimeline(rows);
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
            {first && last ? <span className="mono">{` · ${formatClinicTime(first.start)}–${formatClinicTime(last.end)}`}</span> : null}
          </p>
        </div>
        {data.items.length === 0 ? <EmptyState title={emptyText} /> : null}
        {data.items.length > 0 && rows.length === 0 ? <EmptyState title={emptyFilteredText} /> : null}
        {timeline.length > 0 ? (
          <ol className="flex flex-col">
            {timeline.map((entry, index) => <TimelineRow key={entry.kind === 'visit' ? entry.visit.id : `gap-${entry.start}`} entry={entry} isFirst={index === 0} />)}
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
