'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Pager } from '@/components/data-display/paginated-table';
import { EmptyState, TableSkeleton } from '@/components/feedback/states';
import { isApiError } from '@/lib/api/api-fetch';
import type { PaginatedResponse } from '@/lib/api/pagination';
import { useT } from '@/lib/i18n/use-t';
import { showToast } from '@/lib/ui/toast';
import { useMarkNotificationRead, useNotifications } from '@/lib/notifications/use-notifications';
import type { NotificationItem } from '@/lib/notifications/notification-api';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { SegmentedTabs, tabPanelProps, type TabOption } from './segmented-tabs';
import { useClampedPage } from './use-clamped-page';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useRestoreFocus } from './use-restore-focus';
import { WRAP_TEXT } from './wrap-text';

export const NOTIFICATIONS_PAGE_SIZE = 10;
const TABS_ID = 'notifications';

type NotificationTab = 'all' | 'unread';

const CATEGORY_KEYS: Readonly<Record<string, string>> = {
  appointment: 'categoryAppointment',
  encounter: 'categoryEncounter',
  registration: 'categoryRegistration',
};

interface ItemProps {
  readonly item: NotificationItem;
  /** The id being marked right now, so only its button shows the busy state. */
  readonly markingId: string | null;
  readonly onMarkRead: (id: string) => void;
}

function MarkReadButton({ item, markingId, onMarkRead }: ItemProps): ReactNode {
  const t = useT('patient.notifications');
  const isMarking: boolean = markingId === item.id;
  return (
    <button
      type="button"
      disabled={isMarking}
      aria-describedby={`notification-${item.id}-text`}
      onClick={() => onMarkRead(item.id)}
      className="no-print min-h-[44px] shrink-0 self-start rounded-[6px] border border-[var(--border)] px-4 text-sm hover:bg-[var(--secondary)] disabled:opacity-60"
    >
      {isMarking ? t('marking') : t('markRead')}
    </button>
  );
}

function NotificationRow({ item, markingId, onMarkRead }: ItemProps): ReactNode {
  const t = useT('patient.notifications');
  const format = useClinicFormat();
  return (
    <li className={`flex flex-col gap-3 rounded-[6px] border bg-[var(--card)] p-4 sm:flex-row sm:items-start sm:justify-between ${item.read ? 'border-[var(--border)]' : 'border-l-4 border-[var(--border)] border-l-[var(--primary)]'}`}>
      <div className="min-w-0 sm:flex-1">
        <p className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
          <span className="form-label">{t(CATEGORY_KEYS[item.category] ?? 'categoryOther')}</span>
          <time dateTime={item.sent}>{format.dateTime(item.sent)}</time>
          {item.read ? null : <span className="font-semibold text-[var(--primary)]">{t('unread')}</span>}
        </p>
        <p id={`notification-${item.id}-text`} className={`mt-1 text-sm ${WRAP_TEXT}`}>{format.prose(item.text)}</p>
      </div>
      {item.read ? null : <MarkReadButton item={item} markingId={markingId} onMarkRead={onMarkRead} />}
    </li>
  );
}

interface ListProps {
  readonly page: PaginatedResponse<NotificationItem>;
  readonly markingId: string | null;
  readonly listRef: RefObject<HTMLUListElement>;
  readonly onMarkRead: (id: string) => void;
  readonly onPage: (page: number) => void;
}

function NotificationItems({ page, markingId, listRef, onMarkRead, onPage }: ListProps): ReactNode {
  const t = useT('patient.notifications');
  return (
    <>
      <ul ref={listRef} tabIndex={-1} aria-label={t('listLabel')} className="grid grid-cols-1 gap-2 focus:outline-none">
        {page.items.map((item) => <NotificationRow key={item.id} item={item} markingId={markingId} onMarkRead={onMarkRead} />)}
      </ul>
      {page.meta.totalPages > 1 ? <Pager meta={page.meta} onPage={onPage} /> : null}
    </>
  );
}

/**
 * The "nothing here" notice sits in a live region that is always on the page: when the last unread item is marked read the
 * list disappears under the user, and a region that appears together with its text is not reliably announced.
 */
function EmptyNotice({ tab, isEmpty }: { readonly tab: NotificationTab; readonly isEmpty: boolean }): ReactNode {
  const t = useT('patient.notifications');
  return <div role="status">{isEmpty ? <EmptyState title={tab === 'unread' ? t('emptyUnread') : t('empty')} /> : null}</div>;
}

interface MarkReadState {
  readonly markingId: string | null;
  readonly failure: unknown;
  readonly markRead: (id: string) => void;
  readonly clearFailure: () => void;
}

/** Marks one notification read; the list and the bell counter refresh through the shared invalidation table. */
function useMarkRead(begin: () => () => void, onRefresh: () => void): MarkReadState {
  const { mutate, reset, error, isPending, variables } = useMarkNotificationRead();
  const markRead = useCallback(
    (id: string) => {
      const restoreFocus: () => void = begin();
      mutate(id, {
        // The button that had the focus is gone with the "unread" state: keep the keyboard user on the page.
        onSuccess: () => {
          showToast('success', 'patient.notifications.markedRead');
          restoreFocus();
        },
        // The notification may be gone already (404): show the real list instead of a stale one.
        onError: onRefresh,
      });
    },
    [mutate, begin, onRefresh],
  );
  return { markingId: isPending ? (variables ?? null) : null, failure: error, markRead, clearFailure: reset };
}

interface CenterState extends MarkReadState {
  readonly tab: NotificationTab;
  readonly query: ReturnType<typeof useNotifications>;
  readonly listRef: RefObject<HTMLUListElement>;
  readonly panelRef: RefObject<HTMLDivElement>;
  readonly changeTab: (tab: NotificationTab) => void;
  readonly setPage: (page: number) => void;
}

/** Everything the center keeps: the open tab and page, the read, the mark-as-read action and where the focus goes after it. */
function useCenterState(): CenterState {
  const [tab, setTab] = useState<NotificationTab>('all');
  const [page, setPage] = useState(1);
  const listRef = useRef<HTMLUListElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const query = useNotifications({ page, pageSize: NOTIFICATIONS_PAGE_SIZE, unread: tab === 'unread' });
  const { refetch } = query;
  const begin = useRestoreFocus(query.dataUpdatedAt, listRef, panelRef);
  const mark = useMarkRead(begin, useCallback(() => void refetch(), [refetch]));
  const { clearFailure } = mark;
  // A banner about a notification that is no longer on screen would only confuse: it goes with the tab or the page.
  useEffect(() => {
    clearFailure();
  }, [tab, page, clearFailure]);
  useClampedPage(query.data?.meta, page, setPage);
  const changeTab = useCallback((next: NotificationTab) => {
    setTab(next);
    setPage(1);
  }, []);
  return { ...mark, tab, query, listRef, panelRef, changeTab, setPage };
}

function PanelBody({ state }: { readonly state: CenterState }): ReactNode {
  const { query, tab, failure } = state;
  return (
    <>
      {isApiError(failure) ? <div className="mb-3"><ProblemBanner problem={failure.problem} /></div> : null}
      {query.data === undefined ? <QueryFailure query={query} embedded pending={<TableSkeleton />} /> : null}
      {query.data && query.data.items.length > 0 ? (
        <NotificationItems page={query.data} markingId={state.markingId} listRef={state.listRef} onMarkRead={state.markRead} onPage={state.setPage} />
      ) : null}
      <EmptyNotice tab={tab} isEmpty={query.data !== undefined && query.data.items.length === 0} />
    </>
  );
}

/** The patient's in-app notifications (FR-008, scenario E): all or only unread, mark as read, refreshed every 30 s. */
export function NotificationCenter(): ReactNode {
  const t = useT('patient.notifications');
  const state = useCenterState();
  const options: ReadonlyArray<TabOption<NotificationTab>> = [{ value: 'all', label: t('tabAll') }, { value: 'unread', label: t('tabUnread') }];
  useDocumentTitle(t('title'));
  return (
    <section>
      <h1 className="serif text-2xl font-bold">{t('title')}</h1>
      <div className="mt-4"><SegmentedTabs idPrefix={TABS_ID} label={t('tabsLabel')} options={options} value={state.tab} onChange={state.changeTab} /></div>
      <div ref={state.panelRef} tabIndex={-1} aria-busy={state.query.isFetching} {...tabPanelProps(TABS_ID, state.tab)} className="mt-4 focus:outline-none">
        <PanelBody state={state} />
      </div>
    </section>
  );
}
