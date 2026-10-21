'use client';

import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card } from '@/components/ui/card';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { Pager } from '@/components/data-display/paginated-table';
import { EmptyState, TableSkeleton } from '@/components/feedback/states';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { SegmentedTabs, tabPanelProps, type TabOption } from '@/components/patient/segmented-tabs';
import { useClampedPage } from '@/components/patient/use-clamped-page';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useFocusFallback } from '@/components/patient/use-focus-fallback';
import type { PaginatedResponse } from '@/lib/api/pagination';
import { useT } from '@/lib/i18n/use-t';
import { AppointmentCard } from './appointment-card';
import { dayHeading, groupByDay } from './appointment-day';
import { activeFirst, type AppointmentTab, type AppointmentView } from './appointment-types';
import { NextAppointment } from './next-appointment';
import { CancelAppointmentDialog } from './cancel-appointment-dialog';
import { useAppointments } from './use-appointments';

export const APPOINTMENTS_PAGE_SIZE = 10;
const TABS_ID = 'appointments';

function EmptyAppointments({ tab }: { readonly tab: AppointmentTab }): ReactNode {
  const t = useT('appointments');
  const cta = <Link href="/booking" className={buttonVariants({ variant: 'primary' })}>{t('bookCta')}</Link>;
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
  const { locale } = useClinicFormat();
  const isUpcoming: boolean = tab === 'upcoming';
  const ordered: ReadonlyArray<AppointmentView> = isUpcoming ? activeFirst(page.items) : page.items;
  const next: AppointmentView | undefined = isUpcoming && page.meta.page === 1 ? ordered.find((appointment) => appointment.status === 'booked') : undefined;
  const items: ReadonlyArray<AppointmentView> = next === undefined ? ordered : ordered.filter((appointment) => appointment !== next);
  const groups = groupByDay(items);
  return (
    <div className="flex flex-col gap-6">
      {next === undefined ? null : <NextAppointment appointment={next} onCancel={onCancel} />}
      {isUpcoming && items.some((appointment) => appointment.status === 'cancelled') ? (
        <p className="text-sm text-muted-foreground">{t('upcomingCancelledHint')}</p>
      ) : null}
      {groups.length === 0 ? null : (
        <div role="list" aria-label={t('listLabel')} className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={`${group.day}-${group.items[0]?.id ?? ''}`} aria-label={dayHeading(group.day, locale)} role="listitem" className="flex flex-col gap-2.5">
              <h2 className="text-base font-semibold text-muted-foreground first-letter:uppercase">{dayHeading(group.day, locale)}</h2>
              <Card as="div" padding="none" className="divide-y divide-border overflow-hidden">
                {group.items.map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} onCancel={onCancel} />)}
              </Card>
            </section>
          ))}
        </div>
      )}
      {page.meta.totalPages > 1 ? <Pager meta={page.meta} onPage={onPage} /> : null}
    </div>
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
  if (page === undefined) return <QueryFailure query={query} embedded pending={<TableSkeleton />} />;
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
  const { tab, page, target, setTab, setPage, setTarget } = useListState();
  const panel = useRef<HTMLDivElement>(null);
  const query = useAppointments({ tab, page, pageSize: APPOINTMENTS_PAGE_SIZE });
  const close = useCallback(() => setTarget(null), [setTarget]);
  const options: ReadonlyArray<TabOption<AppointmentTab>> = [{ value: 'upcoming', label: t('tabUpcoming') }, { value: 'all', label: t('tabAll') }];
  useClampedPage(query.data?.meta, page, setPage);
  // The card that opened the dialog may lose its cancel button (cancelled, or found not cancellable): keep the focus in the list.
  useFocusFallback(target !== null, panel);
  useDocumentTitle(t('title'));
  return (
    <section className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[34px]">{t('title')}</h1>
        <Link href="/booking" className={`no-print ${buttonVariants({ variant: 'primary', size: 'lg' })}`}><Plus aria-hidden="true" size={18} strokeWidth={2.2} />{t('newBooking')}</Link>
      </div>
      <div><SegmentedTabs idPrefix={TABS_ID} label={t('tabsLabel')} options={options} value={tab} onChange={setTab} /></div>
      <div ref={panel} tabIndex={-1} aria-busy={query.isFetching} {...tabPanelProps(TABS_ID, tab)} className="focus:outline-none">
        <AppointmentsPanel tab={tab} query={query} onCancel={setTarget} onPage={setPage} />
      </div>
      {target !== null ? <CancelAppointmentDialog appointment={target} onClose={close} onCancelled={close} /> : null}
    </section>
  );
}
