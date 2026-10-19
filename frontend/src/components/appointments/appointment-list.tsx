'use client';

import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import Link from 'next/link';
import { Pager } from '@/components/data-display/paginated-table';
import { EmptyState, TableSkeleton } from '@/components/feedback/states';
import { QueryErrorState } from '@/components/patient/query-error-state';
import { SegmentedTabs, tabPanelProps, type TabOption } from '@/components/patient/segmented-tabs';
import { useClampedPage } from '@/components/patient/use-clamped-page';
import { useDocumentTitle } from '@/components/patient/use-document-title';
import { useFocusFallback } from '@/components/patient/use-focus-fallback';
import type { PaginatedResponse } from '@/lib/api/pagination';
import { useT } from '@/lib/i18n/use-t';
import { AppointmentCard } from './appointment-card';
import { activeFirst, type AppointmentTab, type AppointmentView } from './appointment-types';
import { CancelAppointmentDialog } from './cancel-appointment-dialog';
import { useAppointments } from './use-appointments';

export const APPOINTMENTS_PAGE_SIZE = 10;
const TABS_ID = 'appointments';

function EmptyAppointments({ tab }: { readonly tab: AppointmentTab }): ReactNode {
  const t = useT('appointments');
  const cta = <Link href="/booking" className="inline-flex min-h-[44px] items-center rounded-[6px] bg-[var(--primary)] px-4 text-sm text-[var(--primary-foreground)]">{t('bookCta')}</Link>;
  return <EmptyState title={tab === 'upcoming' ? t('emptyUpcoming') : t('empty')} description={t('emptyHint')} action={cta} />;
}

interface ItemsProps {
  readonly tab: AppointmentTab;
  readonly page: PaginatedResponse<AppointmentView>;
  readonly onCancel: (appointment: AppointmentView) => void;
  readonly onPage: (page: number) => void;
}

function AppointmentItems({ tab, page, onCancel, onPage }: ItemsProps): ReactNode {
  const t = useT('appointments');
  const isUpcoming: boolean = tab === 'upcoming';
  const items: ReadonlyArray<AppointmentView> = isUpcoming ? activeFirst(page.items) : page.items;
  return (
    <>
      {isUpcoming && items.some((appointment) => appointment.status === 'cancelled') ? (
        <p className="mb-3 text-sm text-[var(--muted-foreground)]">{t('upcomingCancelledHint')}</p>
      ) : null}
      <ul aria-label={t('listLabel')} className="grid grid-cols-1 gap-3">
        {items.map((appointment) => (
          <li key={appointment.id} className="min-w-0"><AppointmentCard appointment={appointment} onCancel={onCancel} /></li>
        ))}
      </ul>
      {page.meta.totalPages > 1 ? <Pager meta={page.meta} onPage={onPage} /> : null}
    </>
  );
}

interface PanelProps {
  readonly tab: AppointmentTab;
  readonly query: UseQueryResult<PaginatedResponse<AppointmentView>>;
  readonly onCancel: (appointment: AppointmentView) => void;
  readonly onPage: (page: number) => void;
}

/** What the list shows for every state of the read: skeleton, error with retry, empty with a way forward, or the cards. */
function AppointmentsPanel({ tab, query, onCancel, onPage }: PanelProps): ReactNode {
  const page: PaginatedResponse<AppointmentView> | undefined = query.data;
  if (page === undefined) {
    if (query.isError) return <QueryErrorState error={query.error} embedded onRetry={() => void query.refetch()} />;
    return <TableSkeleton />;
  }
  return page.items.length === 0 ? <EmptyAppointments tab={tab} /> : <AppointmentItems tab={tab} page={page} onCancel={onCancel} onPage={onPage} />;
}

/** State of the list view: which tab and page are open, and which appointment the cancel dialog is about. */
function useListState(): {
  readonly tab: AppointmentTab;
  readonly page: number;
  readonly target: AppointmentView | null;
  readonly setTab: (tab: AppointmentTab) => void;
  readonly setPage: (page: number) => void;
  readonly setTarget: (target: AppointmentView | null) => void;
} {
  const [tab, setTabState] = useState<AppointmentTab>('upcoming');
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<AppointmentView | null>(null);
  const setTab = useCallback((next: AppointmentTab) => {
    setTabState(next);
    setPage(1);
  }, []);
  return { tab, page, target, setTab, setPage, setTarget };
}

/** The patient's appointments (FR-006): upcoming and the whole history, server-paged, with cancellation from the list (FR-005). */
export function AppointmentList(): ReactNode {
  const t = useT('appointments');
  const tBrand = useT('layout');
  const { tab, page, target, setTab, setPage, setTarget } = useListState();
  const panel = useRef<HTMLDivElement>(null);
  const query = useAppointments({ tab, page, pageSize: APPOINTMENTS_PAGE_SIZE });
  const close = useCallback(() => setTarget(null), [setTarget]);
  const options: ReadonlyArray<TabOption<AppointmentTab>> = [{ value: 'upcoming', label: t('tabUpcoming') }, { value: 'all', label: t('tabAll') }];
  useClampedPage(query.data?.meta, page, setPage);
  // The card that opened the dialog may lose its cancel button (cancelled, or found not cancellable): keep the focus in the list.
  useFocusFallback(target !== null, panel);
  useDocumentTitle(t('title'), tBrand('brand'));
  return (
    <section>
      <h1 className="serif text-2xl font-bold">{t('title')}</h1>
      <div className="mt-4"><SegmentedTabs idPrefix={TABS_ID} label={t('tabsLabel')} options={options} value={tab} onChange={setTab} /></div>
      <div ref={panel} tabIndex={-1} aria-busy={query.isFetching} {...tabPanelProps(TABS_ID, tab)} className="mt-4 focus:outline-none">
        <AppointmentsPanel tab={tab} query={query} onCancel={setTarget} onPage={setPage} />
      </div>
      {target !== null ? <CancelAppointmentDialog appointment={target} onClose={close} onCancelled={close} /> : null}
    </section>
  );
}
