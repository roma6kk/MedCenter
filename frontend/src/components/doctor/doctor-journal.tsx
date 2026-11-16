'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import type { UseQueryResult } from '@tanstack/react-query';
import { ContentSkeleton } from '@/components/feedback/content-skeleton';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { writeUrlQuery } from '@/hooks/use-url-state';
import { useT } from '@/lib/i18n/use-t';
import { formatDayHeading, isDateKey } from '@/lib/clinic-time';
import type { DoctorJournalPage, JournalAppointment } from './doctor-types';
import { JournalControls, type JournalView, type StatusFilter } from './journal-controls';
import { JournalDayView } from './journal-day-view';
import { JournalEmptyDay } from './journal-empty-day';
import { rangeLabel, workingDays } from './journal-model';
import { JournalWeekView, type DayColumn } from './journal-week-view';
import { useDoctorJournal, useDoctorWeekJournal } from './use-doctor-queries';
import { useMinskToday } from './use-minsk-today';

function dayFromUrl(raw: string | null): string | null {
  return raw !== null && isDateKey(raw) ? raw : null;
}

interface JournalState {
  readonly dateKey: string;
  readonly today: string;
  readonly status: StatusFilter;
  readonly journal: UseQueryResult<DoctorJournalPage>;
  readonly rows: ReadonlyArray<JournalAppointment>;
  readonly setPage: (page: number) => void;
  readonly setStatus: (status: StatusFilter) => void;
  readonly changeDate: (dateKey: string) => void;
}

function passesFilter(item: JournalAppointment, status: StatusFilter): boolean {
  return status === 'all' || item.status === status;
}

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
    writeUrlQuery(day === null ? '' : `date=${day}`);
  };
  return [selected, choose];
}

function useJournalState(): JournalState {
  const today: string = useMinskToday();
  const [selected, choose] = useSelectedDay();
  const dateKey: string = selected ?? today;
  const [pageOf, setPageOf] = useState<{ readonly day: string; readonly page: number }>({ day: dateKey, page: 1 });
  const page: number = pageOf.day === dateKey ? pageOf.page : 1;
  const [status, setStatus] = useState<StatusFilter>('all');
  const journal = useDoctorJournal(dateKey, page);
  const rows: ReadonlyArray<JournalAppointment> = (journal.data?.items ?? []).filter((item) => passesFilter(item, status));
  const changeDate = (next: string): void => choose(next === today ? null : next);
  const setPage = (next: number): void => setPageOf({ day: dateKey, page: next });
  return { dateKey, today, status, journal, rows, setPage, setStatus, changeDate };
}

function useWeekColumns(dateKey: string, status: StatusFilter, enabled: boolean): ReadonlyArray<DayColumn> {
  const dateKeys: ReadonlyArray<string> = workingDays(dateKey);
  const queries: ReadonlyArray<UseQueryResult<DoctorJournalPage>> = useDoctorWeekJournal(enabled ? dateKeys : []);
  return enabled
    ? dateKeys.map((day, index) => {
        const query = queries[index] as UseQueryResult<DoctorJournalPage>;
        return { dateKey: day, query, visits: (query.data?.items ?? []).filter((item) => passesFilter(item, status)) };
      })
    : [];
}

interface DayBodyProps {
  readonly journal: UseQueryResult<DoctorJournalPage>;
  readonly rows: ReadonlyArray<JournalAppointment>;
  readonly status: StatusFilter;
  readonly setPage: (page: number) => void;
  readonly dateKey: string;
  readonly today: string;
  readonly onJump: (dateKey: string) => void;
}

function DayBody({ journal, rows, status, setPage, dateKey, today, onJump }: DayBodyProps): ReactNode {
  const t = useT('doctor.journal');
  if (journal.data === undefined) return <QueryFailure query={journal} embedded notFoundText={t('loadError')} pending={<ContentSkeleton shape="timeline" rows={3} />} />;
  return (
    <>
      {status !== 'all' && journal.data.meta.totalPages > 1 ? <p className="mb-3 text-sm text-warning">{t('filterPageHint', { page: journal.data.meta.page, pages: journal.data.meta.totalPages })}</p> : null}
      <JournalDayView
        data={journal.data}
        rows={rows}
        onPage={setPage}
        empty={<JournalEmptyDay dateKey={dateKey} today={today} onJump={onJump} />}
        emptyFilteredText={t('emptyFiltered')}
        isToday={dateKey === today}
      />
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
      {loading ? <ContentSkeleton shape="timeline" rows={3} /> : <JournalWeekView days={columns} today={today} onOpenDay={onOpenDay} />}
    </>
  );
}

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
          <p className="text-sm font-semibold text-primary-soft-foreground">{eyebrow}</p>
          <h1 id="journal-title" className="mt-1 text-2xl font-bold leading-tight tracking-[-0.02em]">{heading}</h1>
          {isWeek ? <p className="tabular-nums mt-1 text-sm text-muted-foreground">{rangeLabel(columns.map((column) => column.dateKey))}</p> : null}
        </div>
        <JournalControls dateKey={dateKey} today={today} view={view} onViewChange={setView} onDateChange={changeDate} status={status} onStatusChange={setStatus} />
      </div>
      <div aria-busy={isWeek ? columns.some((column) => column.query.isFetching) : journal.isFetching}>
        {isWeek ? <WeekBody columns={columns} today={today} onOpenDay={openDay} /> : <DayBody journal={journal} rows={rows} status={status} setPage={setPage} dateKey={dateKey} today={today} onJump={changeDate} />}
      </div>
    </section>
  );
}
