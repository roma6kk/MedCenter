'use client';

import { useEffect, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import Link from 'next/link';
import { useFloatingPosition } from '@/components/ui/floating';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { buttonVariants } from '@/components/ui/button-variants';
import { notificationAction, notificationKind } from '@/components/patient/notifications/notification-logic';
import { WRAP_TEXT } from '@/components/patient/wrap-text';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { useT } from '@/lib/i18n/use-t';
import type { NotificationItem } from '@/lib/notifications/notification-api';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/lib/notifications/use-notifications';
import { cn } from '@/lib/ui/cn';

/** How many of the latest notifications the dropdown shows; the page «Все уведомления» has the rest. */
export const PANEL_ITEMS = 5;
const PANEL_WIDTH_PX = 384;
const EDGE_PX = 16;

const FOCUSABLE = 'a[href], button:not([disabled])';

function ItemBody({ item }: { readonly item: NotificationItem }): ReactNode {
  const t = useT('patient.notifications');
  const format = useClinicFormat();
  const kind = notificationKind(item.category);
  const Icon = kind.icon;
  return (
    <>
      <span aria-hidden="true" className={cn('inline-flex size-9 flex-none items-center justify-center rounded-control', kind.tone)}>
        <Icon className="size-[18px]" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn('line-clamp-2 text-sm', WRAP_TEXT, item.read ? 'font-normal' : 'font-semibold')}>{format.prose(item.text)}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{t(kind.labelKey)}</span>
          <time dateTime={item.sent} className="tabular-nums">{format.dateTime(item.sent)}</time>
        </span>
      </span>
      {item.read ? null : (
        <span className="flex flex-none items-center" data-testid="panel-unread-dot">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-primary" />
          <span className="sr-only">{t('unread')}</span>
        </span>
      )}
    </>
  );
}

const ROW_CLASS = 'flex min-h-[44px] items-center gap-3 px-4 py-3';

interface RowProps {
  readonly item: NotificationItem;
  readonly onOpen: (item: NotificationItem) => void;
}

/** A notification that leads somewhere is a link (and is read by opening it); one that does not is plain text. */
function Row({ item, onOpen }: RowProps): ReactNode {
  const action = notificationAction(item);
  return (
    <li className={cn('border-t border-border-soft first:border-t-0', item.read ? 'bg-card' : 'bg-secondary')}>
      {action === null ? (
        <div className={ROW_CLASS}><ItemBody item={item} /></div>
      ) : (
        <Link href={action.href} onClick={() => onOpen(item)} className={cn(ROW_CLASS, 'hover:bg-primary-soft focus-visible:bg-primary-soft')}>
          <ItemBody item={item} />
        </Link>
      )}
    </li>
  );
}

function PanelSkeleton(): ReactNode {
  const t = useT('common');
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3 p-4">
      <span className="sr-only">{t('loading')}</span>
      {[0, 1, 2].map((row) => (
        <div key={row} aria-hidden="true" className="flex items-center gap-3">
          <Skeleton shape="circle" className="size-9 rounded-control" />
          <div className="flex flex-1 flex-col gap-1.5"><Skeleton className="w-full" /><Skeleton className="w-1/3" /></div>
        </div>
      ))}
    </div>
  );
}

interface PanelProps {
  readonly id: string;
  readonly trigger: HTMLElement | null;
  readonly unreadCount: number;
  readonly onClose: (restoreFocus: boolean) => void;
}

/**
 * The dropdown of the bell: the latest five notifications, «Отметить все прочитанными» and the link to the whole list.
 * A non-modal dialog drawn next to the bell (the shared floating position keeps it on screen); the first control takes the
 * focus, Escape closes it and returns the focus to the bell. It reads the list only while it is open.
 */
export function NotificationBellPanel({ id, trigger, unreadCount, onClose }: PanelProps): ReactNode {
  const t = useT('layout.notifications');
  const panel = useRef<HTMLDivElement>(null);
  const query = useNotifications({ page: 1, pageSize: PANEL_ITEMS });
  const markOne = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const width: number = Math.min(PANEL_WIDTH_PX, window.innerWidth - EDGE_PX);
  const position = useFloatingPosition({ anchor: trigger, panel, align: 'end', width, onOutsidePress: () => onClose(false) });
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    onClose(true);
  };
  const open = (item: NotificationItem): void => {
    if (!item.read) markOne.mutate(item.id);
    onClose(false);
  };
  const items: ReadonlyArray<NotificationItem> = query.data?.items.slice(0, PANEL_ITEMS) ?? [];
  return (
    <div
      ref={panel}
      id={id}
      role="dialog"
      aria-label={t('panelLabel')}
      aria-busy={query.isFetching}
      onKeyDown={onKeyDown}
      style={{ top: position?.top ?? 0, left: position?.left ?? 0, width }}
      className={cn('fixed z-50 animate-menu-in overflow-hidden rounded-card border border-border bg-card shadow-elev-2', position === null && 'opacity-0')}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border-soft px-4 py-2">
        <h2 className="text-base font-bold">{t('panelTitle')}</h2>
        {unreadCount > 0 ? (
          <button
            type="button"
            aria-disabled={markAll.isPending ? true : undefined}
            onClick={() => { if (!markAll.isPending) markAll.mutate(); }}
            className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-control px-2 text-sm font-semibold text-primary-soft-foreground hover:underline"
          >
            {markAll.isPending ? t('markingAll') : t('markAll')}
          </button>
        ) : null}
      </div>
      {query.data === undefined ? <div className="max-h-[60vh] overflow-y-auto"><QueryFailure query={query} embedded pending={<PanelSkeleton />} /></div> : null}
      {query.data !== undefined && items.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t('panelEmpty')}</p> : null}
      {items.length > 0 ? <ul aria-label={t('panelLabel')} className="max-h-[60vh] overflow-y-auto">{items.map((item) => <Row key={item.id} item={item} onOpen={open} />)}</ul> : null}
      <div className="border-t border-border-soft p-1">
        <Link href="/notifications" onClick={() => onClose(false)} className={cn(buttonVariants({ variant: 'ghost' }), 'w-full')}>{t('viewAll')}</Link>
      </div>
    </div>
  );
}

