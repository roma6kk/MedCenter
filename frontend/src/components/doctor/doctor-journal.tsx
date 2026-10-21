'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import type { UseQueryResult } from '@tanstack/react-query';
import { TableSkeleton } from '@/components/feedback/states';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useT } from '@/lib/i18n/use-t';
import { formatDayHeading, isDateKey } from '@/lib/clinic-time';
import type { DoctorJournalPage, JournalAppointment } from './doctor-types';
import { JournalControls, type JournalView, type StatusFilter } from './journal-controls';
import { JournalDayView } from './journal-day-view';
import { rangeLabel, workingDays } from './journal-model';
import { JournalWeekView, type DayColumn } from './journal-week-view';
import { useDoctorJournal, useDoctorWeekJournal } from './use-doctor-queries';
import { useMinskToday } from './use-minsk-today';

const JOURNAL_PATH = '/doctor/appointments';

/** The day in `?date=`; `null` (today) when it is missing or not a calendar date. */
function dayFromUrl(raw: string | null): string | null {
  return raw !== null && isDateKey(raw) ? raw : null;
}

/** Mirrors the chosen day into the address bar without a navigation (Next syncs `useSearchParams` with `replaceState`). */
function writeDayToUrl(day: string | null): void {
  window.history.replaceState(null, '', day === null ? JOURNAL_PATH : `${JOURNAL_PATH}?date=${day}`);
}

interface JournalState {
  readonly dateKey: string;
  readonly today: string;
  readonly status: StatusFilter;
  readonly journal: UseQueryResult<DoctorJournalPage>;
  /** Rows of the loaded page that pass the status filter. */
  readonly rows: ReadonlyArray<JournalAppointment>;
  readonly setPage: (page: number) => void;
  readonly setStatus: (status: StatusFilter) => void;
  readonly changeDate: (dateKey: string) => void;
}

/**
 * The day the address bar names, followed in both directions: a choice on screen is written to the URL, and a navigation
 * that changes the URL (the shell's "Journal" link, back/forward) moves the screen. `null` means "today", which keeps
 * following the clock for a journal left open overnight.
 */
function useSelectedDay(): readonly [string | null, (day: string | null) => void] {
  const urlDay: string | null = dayFromUrl(useSearchParams().get('date'));
  const [selected, setSelected] = useState<string | null>(urlDay);
  const [seenUrlDay, setSeenUrlDay] = useState<string | null>(urlDay);
  if (seenUrlDay !== urlDay) {
    setSeenUrlDay(urlDay);
    setSelected(urlDay);
  }
  const choose = (day: string | null): void => {
    setSelected(day);
    writeDayToUrl(day);
  };
  return [selected, choose];
}

/** The day, the server page, the status filter and the journal query that follow from them. */
function useJournalState(): JournalState {
  const today: string = useMinskToday();
  const [selected, choose] = useSelectedDay();
  const dateKey: string = selected ?? today;
  // The page belongs to the day it was chosen on: another day starts from page 1 however it came about.
  const [pageOf, setPageOf] = useState<{ readonly day: string; readonly page: number }>({ day: dateKey, page: 1 });
  const page: number = pageOf.day === dateKey ? pageOf.page : 1;
  const [status, setStatus] = useState<StatusFilter>('all');
  const journal = useDoctorJournal(dateKey, page);
  const rows: ReadonlyArray<JournalAppointment> = (journal.data?.items ?? []).filter((item) => status === 'all' || item.status === status);
  const changeDate = (next: string): void => choose(next === today ? null : next);
  const setPage = (next: number): void => setPageOf({ day: dateKey, page: next });
  return { dateKey, today, status, journal, rows, setPage, setStatus, changeDate };
}

function passesFilter(item: JournalAppointment, status: StatusFilter): boolean {
  return status === 'all' || item.status === status;
}

/** The week view's columns: five working days from the chosen day, each with the rows of its first journal page that pass the filter. */
function useWeekColumns(dateKey: string, status: StatusFilter, enabled: boolean): ReadonlyArray<DayColumn> {
  const dateKeys: ReadonlyArray<string> = workingDays(dateKey);
  // Parallel per-day queries (no waterfall); they share their cache keys with the day view's first page.
  const queries: ReadonlyArray<UseQueryResult<DoctorJournalPage>> = useDoctorWeekJournal(enabled ? dateKeys : []);
  return enabled
    ? dateKeys.map((day, index) => {
        const query = queries[index] as UseQueryResult<DoctorJournalPage>;
        return { dateKey: day, query, visits: (query.data?.items ?? []).filter((item) => passesFilter(item, status)) };
      })
    : [];
}

function DayBody({ journal, rows, status, setPage }: { readonly journal: UseQueryResult<DoctorJournalPage>; readonly rows: ReadonlyArray<JournalAppointment>; readonly status: StatusFilter; readonly setPage: (page: number) => void }): ReactNode {
  const t = useT('doctor.journal');
  if (journal.data === undefined) return <QueryFailure query={journal} embedded notFoundText={t('loadError')} pending={<TableSkeleton />} />;
  return (
    <>
      {status !== 'all' && journal.data.meta.totalPages > 1 ? <p className="mb-3 text-sm text-warning">{t('filterPageHint', { page: journal.data.meta.page, pages: journal.data.meta.totalPages })}</p> : null}
      <JournalDayView data={journal.data} rows={rows} onPage={setPage} emptyText={t('empty')} emptyFilteredText={t('emptyFiltered')} />
    </>
  );
}

function WeekBody({ columns, today, onOpenDay }: { readonly columns: ReadonlyArray<DayColumn>; readonly today: string; readonly onOpenDay: (dateKey: string) => void }): ReactNode {
  const t = useT('doctor.journal');
  const failed: DayColumn | undefined = columns.find((column) => column.query.isError);
  const loading: boolean = columns.every((column) => column.query.isPending);
  return (
    <>
      {failed ? <div className="mb-3"><QueryFailure query={failed.query} embedded notFoundText={t('loadError')} pending={null} /></div> : null}
      {loading ? <TableSkeleton /> : <JournalWeekView days={columns} today={today} onOpenDay={onOpenDay} />}
    </>
  );
}

/** The doctor's journal (FR-009): one clinic day as a timeline or five working days as a grid, a status filter, the actions of a booked visit. */
export function DoctorJournal(): ReactNode {
  const t = useT('doctor.journal');
  const { dateKey, today, status, journal, rows, setPage, setStatus, changeDate } = useJournalState();
  const [view, setView] = useState<JournalView>('day');
  const isWeek: boolean = view === 'week';
  const columns: ReadonlyArray<DayColumn> = useWeekColumns(dateKey, status, isWeek);
  useDocumentTitle(t('title'));

  const loaded: ReadonlyArray<JournalAppointment> = columns.flatMap((column) => column.visits);
  const heading: string = isWeek ? t('weekHeading') : formatDayHeading(dateKey);
  const eyebrow: string = isWeek
    ? t('weekSummary', { total: loaded.length, pending: loaded.filter((item) => item.status === 'booked').length })
    : dateKey === today ? t('todayEyebrow') : t('title');
  const openDay = (day: string): void => {
    changeDate(day);
    setView('day');
  };

  return (
    <section aria-labelledby="journal-title" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.06em] text-primary-soft-foreground">{eyebrow}</p>
          <h1 id="journal-title" className="mt-1 text-[30px] font-bold leading-tight tracking-[-0.02em]">{heading}</h1>
          {isWeek ? <p className="mono mt-1 text-sm text-muted-foreground">{rangeLabel(columns.map((column) => column.dateKey))}</p> : null}
        </div>
        <JournalControls dateKey={dateKey} today={today} view={view} onViewChange={setView} onDateChange={changeDate} status={status} onStatusChange={setStatus} />
      </div>
      <div aria-busy={isWeek ? columns.some((column) => column.query.isFetching) : journal.isFetching}>
        {isWeek ? <WeekBody columns={columns} today={today} onOpenDay={openDay} /> : <DayBody journal={journal} rows={rows} status={status} setPage={setPage} />}
      </div>
    </section>
  );
}
