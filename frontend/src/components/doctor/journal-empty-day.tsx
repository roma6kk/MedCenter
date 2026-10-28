'use client';

import type { ReactNode } from 'react';
import { CalendarCheck } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button-variants';
import { Skeleton } from '@/components/ui/skeleton';
import { clinicDayOf, daysBetween, formatClinicTime, formatDateKey, formatDayHeading } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { shortName } from './journal-model';
import { NEXT_VISIT_LOOKAHEAD_DAYS, useNextBookedVisit } from './use-doctor-queries';

interface JournalEmptyDayProps {
  readonly dateKey: string;
  readonly today: string;
  /** Opens the day of the next visit in the journal. */
  readonly onJump: (dateKey: string) => void;
}

/** `сегодня`, `завтра` or the day with its weekday: how the next visit is placed in time. */
function useWhen(): (dayKey: string, today: string) => string {
  const t = useT('doctor.journal');
  return (dayKey, today) => {
    const distance: number = daysBetween(today, dayKey);
    if (distance === 0) return t('whenToday');
    if (distance === 1) return t('whenTomorrow');
    return formatDayHeading(dayKey);
  };
}

/**
 * A day without visits (A12). «No visits» alone is a dead end: the card looks ahead (`NEXT_VISIT_LOOKAHEAD_DAYS`) for the
 * doctor's next booked visit, says when it is and with whom, and jumps to that day.
 */
export function JournalEmptyDay({ dateKey, today, onJump }: JournalEmptyDayProps): ReactNode {
  const t = useT('doctor.journal');
  const when = useWhen();
  const next = useNextBookedVisit(dateKey, today, true);
  const title: string = dateKey === today ? t('emptyToday') : t('emptyDay', { date: formatDateKey(dateKey) });
  const visit = next.data ?? null;
  const day: string = visit === null ? '' : clinicDayOf(visit.start);
  return (
    <div data-testid="journal-empty-day" className="mx-auto flex max-w-md flex-col items-center gap-3 p-6 text-center">
      <span aria-hidden="true" className="inline-flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground">
        <CalendarCheck className="size-7" strokeWidth={1.75} />
      </span>
      <h3 className="text-xl font-semibold">{title}</h3>
      {next.isPending ? <Skeleton className="h-5 w-64" /> : null}
      {visit === null && !next.isPending && !next.isError ? <p className="text-muted-foreground">{t('nothingAhead', { days: NEXT_VISIT_LOOKAHEAD_DAYS })}</p> : null}
      {visit !== null ? (
        <>
          <p className="text-muted-foreground">
            {t('nextVisitOn', {
              when: when(day, today),
              time: formatClinicTime(visit.start),
              patient: visit.patientName === undefined ? t('unknownPatient', { id: visit.patientId }) : shortName(visit.patientName),
            })}
          </p>
          <button type="button" onClick={() => onJump(day)} className={cn(buttonVariants({ variant: 'primary' }), 'mt-1')}>
            {t('goToVisit')}
          </button>
        </>
      ) : null}
    </div>
  );
}
