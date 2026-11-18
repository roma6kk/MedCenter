'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BellRing, CheckCheck } from 'lucide-react';
import { Pager } from '@/components/data-display/paginated-table';
import { EmptyState } from '@/components/feedback/states';
import { ContentSkeleton } from '@/components/feedback/content-skeleton';
import { buttonVariants } from '@/components/ui/button-variants';
import { isApiError } from '@/lib/api/api-fetch';
import { invalidateFor } from '@/lib/api/invalidation';
import type { PaginatedResponse } from '@/lib/api/pagination';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { showToast } from '@/lib/ui/toast';
import { markAllNotificationsRead, type NotificationItem } from '@/lib/notifications/notification-api';
import { useMarkNotificationRead, useNotifications, useUnreadCount } from '@/lib/notifications/use-notifications';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { formatDayHeading } from '@/lib/clinic-time';
import { BookLink } from './book-link';
import { SegmentedTabs, tabPanelProps, type TabOption } from './segmented-tabs';
import { useClampedPage } from './use-clamped-page';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { parsePage, useUrlState } from '@/hooks/use-url-state';
import { useStaggerOnce } from '@/hooks/use-stagger-once';
import { useRestoreFocus } from './use-restore-focus';
import { NotificationRow } from './notifications/notification-row';
import { groupByClinicDay, matchesFilter, NOTIFICATION_FILTERS, type NotificationFilter } from './notifications/notification-logic';

const NOTIFICATIONS_PAGE_SIZE = 10;
const TABS_ID = 'notifications';

interface ListProps {
  readonly items: ReadonlyArray<NotificationItem>;
  readonly meta: PaginatedResponse<NotificationItem>['meta'];
  readonly markingId: string | null;
  readonly listRef: RefObject<HTMLDivElement>;
  readonly onMarkRead: (id: string) => void;
  readonly onPage: (page: number) => void;
}

function NotificationItems({ items, meta, markingId, listRef, onMarkRead, onPage }: ListProps): ReactNode {
  const t = useT('patient.notifications');
  const format = useClinicFormat();
  const enter = useStaggerOnce();
  return (
    <>
      <div ref={listRef} tabIndex={-1} role="group" aria-label={t('listLabel')} className="flex flex-col gap-6 focus:outline-none">
        {groupByClinicDay(items).map((day) => (
          <section key={day.dayKey} className="flex flex-col gap-2.5">
            <h2 id={`notifications-day-${day.dayKey}`} className="text-base font-semibold text-muted-foreground">{formatDayHeading(day.dayKey, format.locale)}</h2>
            <ul aria-labelledby={`notifications-day-${day.dayKey}`} className={cn('overflow-hidden rounded-panel border border-border bg-card', enter)}>
              {day.items.map((item) => <NotificationRow key={item.id} item={item} markingId={markingId} onMarkRead={onMarkRead} />)}
            </ul>
          </section>
        ))}
      </div>
      {meta.totalPages > 1 ? <div className="mt-4"><Pager meta={meta} onPage={onPage} /></div> : null}
    </>
  );
}

function EmptyNotice({ filter, isEmpty }: { readonly filter: NotificationFilter; readonly isEmpty: boolean }): ReactNode {
  const t = useT('patient.notifications');
  const tn = useT('patientNotifications');
  let empty: ReactNode = null;
  if (isEmpty && filter === 'all') empty = <EmptyState icon={BellRing} title={t('empty')} description={t('emptyHint')} action={<BookLink label={t('emptyCta')} />} />;
  else if (isEmpty && filter === 'unread') empty = <EmptyState icon={CheckCheck} title={t('emptyUnread')} description={t('emptyUnreadHint')} />;
  else if (isEmpty) empty = <EmptyState icon={BellRing} title={tn('emptyType')} />;
  return <div role="status">{empty}</div>;
}

interface MarkReadState {
  readonly markingId: string | null;
  readonly failure: unknown;
  readonly markRead: (id: string) => void;
  readonly markAllRead: () => void;
  readonly allMarking: boolean;
  readonly clearFailure: () => void;
}

function useMarkRead(begin: () => () => void, onRefresh: () => void): MarkReadState {
  const client = useQueryClient();
  const single = useMarkNotificationRead();
  const all = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    // Some notifications may have been marked even when the answer failed: always show the real state.
    onSettled: () => invalidateFor(client, 'read-notification'),
  });
  const { mutate, reset: resetSingle } = single;
  const { mutate: mutateAll, reset: resetAll } = all;
  const markRead = useCallback(
    (id: string) => {
      const restoreFocus: () => void = begin();
      mutate(id, {
        // The focused button is gone with the "unread" state: keep the keyboard user on the page.
        onSuccess: () => {
          showToast('success', 'patient.notifications.markedRead');
          restoreFocus();
        },
        onError: onRefresh,
      });
    },
    [mutate, begin, onRefresh],
  );
  const markAllRead = useCallback(() => {
    const restoreFocus: () => void = begin();
    mutateAll(undefined, {
      onSuccess: () => {
        showToast('success', 'patientNotifications.allMarkedRead');
        restoreFocus();
      },
      onError: onRefresh,
    });
  }, [mutateAll, begin, onRefresh]);
  const clearFailure = useCallback(() => {
    resetSingle();
    resetAll();
  }, [resetSingle, resetAll]);
  return {
    markingId: single.isPending ? (single.variables ?? null) : null,
    failure: single.error ?? all.error,
    markRead,
    markAllRead,
    allMarking: all.isPending,
    clearFailure,
  };
}

interface CenterState extends MarkReadState {
  readonly filter: NotificationFilter;
  readonly query: ReturnType<typeof useNotifications>;
  readonly listRef: RefObject<HTMLDivElement>;
  readonly panelRef: RefObject<HTMLDivElement>;
  readonly changeFilter: (filter: NotificationFilter) => void;
  readonly setPage: (page: number) => void;
}

function useCenterState(): CenterState {
  const [url, setUrl] = useUrlState({ filter: 'all', page: '1' });
  const filter: NotificationFilter = NOTIFICATION_FILTERS.find((item) => item === url.filter) ?? 'all';
  const page: number = parsePage(url.page);
  const setPage = (next: number): void => setUrl({ page: String(next) });
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const query = useNotifications({ page, pageSize: NOTIFICATIONS_PAGE_SIZE, unread: filter === 'unread' });
  const { refetch } = query;
  const begin = useRestoreFocus(query.dataUpdatedAt, listRef, panelRef);
  const mark = useMarkRead(begin, useCallback(() => void refetch(), [refetch]));
  const { clearFailure } = mark;
  useEffect(() => {
    clearFailure();
  }, [filter, page, clearFailure]);
  useClampedPage(query.data?.meta, page, setPage);
  const changeFilter = (next: NotificationFilter): void => setUrl({ filter: next, page: '1' });
  return { ...mark, filter, query, listRef, panelRef, changeFilter, setPage };
}

function PanelBody({ state }: { readonly state: CenterState }): ReactNode {
  const { query, filter, failure } = state;
  const visible: ReadonlyArray<NotificationItem> = query.data ? query.data.items.filter((item) => matchesFilter(item, filter)) : [];
  return (
    <>
      {isApiError(failure) ? <div className="mb-3"><ProblemBanner problem={failure.problem} /></div> : null}
      {query.data === undefined ? <QueryFailure query={query} embedded pending={<ContentSkeleton shape="tiles" rows={3} />} /> : null}
      {query.data && visible.length > 0 ? (
        <NotificationItems items={visible} meta={query.data.meta} markingId={state.markingId} listRef={state.listRef} onMarkRead={state.markRead} onPage={state.setPage} />
      ) : null}
      {query.data && visible.length === 0 && query.data.meta.totalPages > 1 ? <Pager meta={query.data.meta} onPage={state.setPage} /> : null}
      <EmptyNotice filter={filter} isEmpty={query.data !== undefined && visible.length === 0} />
    </>
  );
}

interface HeaderProps {
  readonly unreadCount: number | undefined;
  readonly allMarking: boolean;
  readonly onMarkAll: () => void;
}

function CenterHeader({ unreadCount, allMarking, onMarkAll }: HeaderProps): ReactNode {
  const t = useT('patient.notifications');
  const tn = useT('patientNotifications');
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        {unreadCount === undefined ? null : (
          <p className="mt-1.5 text-base text-muted-foreground">{unreadCount > 0 ? tn('subtitleUnread', { count: unreadCount }) : tn('subtitleAllRead')}</p>
        )}
      </div>
      {unreadCount !== undefined && unreadCount > 0 ? (
        <button type="button" disabled={allMarking} onClick={onMarkAll} className={`no-print ${buttonVariants({ variant: 'secondary', size: 'lg' })}`}>
          {allMarking ? tn('markingPage') : tn('markAllRead')}
        </button>
      ) : null}
    </div>
  );
}

export function NotificationCenter(): ReactNode {
  const t = useT('patient.notifications');
  const tn = useT('patientNotifications');
  const state = useCenterState();
  const unreadCount = useUnreadCount().data;
  const labels: Readonly<Record<NotificationFilter, string>> = {
    all: t('tabAll'),
    unread: t('tabUnread'),
    appointment: tn('filterAppointment'),
    encounter: tn('filterEncounter'),
  };
  const options: ReadonlyArray<TabOption<NotificationFilter>> = NOTIFICATION_FILTERS.map((value) => ({ value, label: labels[value] }));
  useDocumentTitle(t('title'));
  return (
    <section className="flex flex-col gap-6">
      <CenterHeader unreadCount={unreadCount} allMarking={state.allMarking} onMarkAll={state.markAllRead} />
      <div><SegmentedTabs idPrefix={TABS_ID} label={t('tabsLabel')} options={options} value={state.filter} onChange={state.changeFilter} /></div>
      <div ref={state.panelRef} tabIndex={-1} aria-busy={state.query.isFetching} {...tabPanelProps(TABS_ID, state.filter)} className="focus:outline-none">
        <PanelBody state={state} />
      </div>
    </section>
  );
}
