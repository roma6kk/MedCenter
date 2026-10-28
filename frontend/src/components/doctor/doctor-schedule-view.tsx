'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { CalendarX2 } from 'lucide-react';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { EmptyState } from '@/components/feedback/states';
import { ContentSkeleton } from '@/components/feedback/content-skeleton';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { WIDE_QUERY, useMediaQuery } from '@/hooks/use-media-query';
import { useT } from '@/lib/i18n/use-t';
import type { DoctorScheduleResponse, JournalAppointment } from './doctor-types';
import { ScheduleDayList } from './schedule-day-list';
import { ScheduleWeekControls, WeekRangeLabel } from './schedule-week-controls';
import { ScheduleWeekGrid } from './schedule-week-grid';
import { buildWeekCalendar, weekDaysOf, weekStartOf, type WeekCalendar } from './schedule-week-model';
import { ScheduleWindows } from './schedule-windows';
import { useDoctorSchedule, useDoctorWeekAppointments } from './use-doctor-queries';
import { useMinskToday } from './use-minsk-today';

/** The day a phone opens on: the chosen one when it is in the week and has slots, else the first day with slots. */
function dayToShow(calendar: WeekCalendar, chosen: string | null, today: string): string {
  const withSlots = (day: string): boolean => (calendar.days.find((candidate) => candidate.dateKey === day)?.total ?? 0) > 0;
  if (chosen !== null && calendar.days.some((day) => day.dateKey === chosen)) return chosen;
  if (withSlots(today)) return today;
  return calendar.days.find((day) => day.total > 0)?.dateKey ?? calendar.days[0]?.dateKey ?? today;
}

interface CalendarProps {
  readonly data: DoctorScheduleResponse;
  readonly visits: ReadonlyArray<JournalAppointment>;
  readonly days: ReadonlyArray<string>;
  readonly today: string;
}

function ScheduleCalendar({ data, visits, days, today }: CalendarProps): ReactNode {
  const t = useT('doctor.schedule');
  const isWide: boolean = useMediaQuery(WIDE_QUERY);
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const calendar: WeekCalendar = buildWeekCalendar(days, data.items, visits);
  if (calendar.rows.length === 0) return <EmptyState icon={CalendarX2} title={t('noSlots')} description={t('noSlotsHint')} />;
  return isWide ? (
    <ScheduleWeekGrid calendar={calendar} today={today} />
  ) : (
    <ScheduleDayList calendar={calendar} selectedDay={dayToShow(calendar, chosenDay, today)} onSelect={setChosenDay} />
  );
}

/**
 * The signed-in doctor's own schedule (API 5.2.7, FR-009) as a week calendar (A10): free slots are the quiet background,
 * a busy one is a block with the patient's name (the journal of the same week supplies it, joined by slot id). On a phone one
 * day at a time with a strip of the week's days. The working windows are said in words above the calendar (A11).
 */
export function DoctorScheduleView(): ReactNode {
  const t = useT('doctor.schedule');
  useDocumentTitle(t('title'));
  const today: string = useMinskToday();
  const [anchor, setAnchor] = useState<string | null>(null);
  const shownDay: string = anchor ?? today;
  const weekStart: string = weekStartOf(shownDay);
  const days: ReadonlyArray<string> = weekDaysOf(weekStart);
  const schedule = useDoctorSchedule({ from: weekStart, to: days.at(-1) ?? weekStart });
  const visits = useDoctorWeekAppointments(weekStart);
  const moveTo = (dateKey: string): void => setAnchor(dateKey === today ? null : dateKey);

  return (
    <section aria-labelledby="schedule-title" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="tabular-nums text-sm font-semibold text-primary-soft-foreground"><WeekRangeLabel weekStart={weekStart} /></p>
          <h1 id="schedule-title" className="mt-1 text-2xl font-bold leading-tight tracking-[-0.02em]">{t('title')}</h1>
        </div>
        <ScheduleWeekControls weekStart={weekStart} anchor={shownDay} today={today} onChange={moveTo} />
      </div>
      <div aria-busy={schedule.isFetching} className="flex flex-col gap-5">
        {schedule.data === undefined ? <QueryFailure query={schedule} embedded notFoundText={t('loadError')} pending={<ContentSkeleton shape="timeline" rows={3} />} /> : null}
        {schedule.data ? <ScheduleBody data={schedule.data} visits={visits.data?.items ?? []} visitsPartial={(visits.data?.meta.totalPages ?? 1) > 1} days={days} today={today} /> : null}
      </div>
    </section>
  );
}

function ScheduleBody({ data, visits, visitsPartial, days, today }: CalendarProps & { readonly visitsPartial: boolean }): ReactNode {
  const t = useT('doctor.schedule');
  if (data.schedules.length === 0) return <EmptyState title={t('empty')} description={t('emptyHint')} />;
  return (
    <>
      <ScheduleWindows schedules={data.schedules} />
      {data.truncated ? <p role="status" className="text-sm text-warning">{t('truncated')}</p> : null}
      {visitsPartial ? <p role="status" className="text-sm text-warning">{t('visitsPartial')}</p> : null}
      <ScheduleCalendar data={data} visits={visits} days={days} today={today} />
    </>
  );
}
