'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import type { UseQueryResult } from '@tanstack/react-query';
import { PaginatedTable } from '@/components/data-display/paginated-table';
import { EmptyState, TableSkeleton } from '@/components/feedback/states';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useT } from '@/lib/i18n/use-t';
import { formatDayHeading, isDateKey } from '@/lib/clinic-time';
import type { DoctorJournalPage, JournalAppointment } from './doctor-types';
import { JournalControls, type StatusFilter } from './journal-controls';
import { useJournalColumns } from './journal-columns';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { useDoctorJournal } from './use-doctor-queries';
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

function rowKey(row: JournalAppointment): string {
  return row.id;
}

function JournalTable({ data, rows, onPage, caption }: { readonly data: DoctorJournalPage; readonly rows: ReadonlyArray<JournalAppointment>; readonly onPage: (page: number) => void; readonly caption: string }): ReactNode {
  const t = useT('doctor.journal');
  const columns = useJournalColumns();
  if (data.items.length === 0) return <EmptyState title={t('empty')} />;
  if (rows.length === 0) return <EmptyState title={t('emptyFiltered')} />;
  return <PaginatedTable columns={columns} rows={rows} meta={data.meta} onPage={onPage} rowKey={rowKey} caption={caption} />;
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

/** The doctor's day (FR-009): appointments of one clinic day, a status filter, the actions of a booked visit. */
export function DoctorJournal(): ReactNode {
  const t = useT('doctor.journal');
  const { dateKey, today, status, journal, rows, setPage, setStatus, changeDate } = useJournalState();
  useDocumentTitle(t('title'));

  return (
    <section aria-labelledby="journal-title">
      <h1 id="journal-title" className="serif text-2xl font-bold">{t('title')}</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{formatDayHeading(dateKey)}</p>
      <JournalControls dateKey={dateKey} today={today} onDateChange={changeDate} status={status} onStatusChange={setStatus} />
      <div className="mt-4" aria-busy={journal.isFetching}>
        {journal.data === undefined ? <QueryFailure query={journal} embedded notFoundText={t('loadError')} pending={<TableSkeleton />} /> : null}
        {journal.data ? (
          <>
            <p role="status" className="mb-2 text-sm text-[var(--muted-foreground)]">{t('total', { count: journal.data.meta.totalItems })}</p>
            {status !== 'all' && journal.data.meta.totalPages > 1 ? <p className="mb-2 text-sm text-[var(--warning)]">{t('filterPageHint', { page: journal.data.meta.page, pages: journal.data.meta.totalPages })}</p> : null}
            <JournalTable data={journal.data} rows={rows} onPage={setPage} caption={t('caption', { date: formatDayHeading(dateKey) })} />
          </>
        ) : null}
      </div>
    </section>
  );
}
