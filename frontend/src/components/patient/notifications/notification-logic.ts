/**
 * notification-logic — the pure rules of the notification page: grouping by clinic day, what a type looks like and where
 * it leads, and the filter predicate. No React, no formatting of dates (that is `lib/clinic-time`).
 */
import { CalendarCheck, ClipboardCheck, MessageSquare, UserPlus, type LucideIcon } from 'lucide-react';
import { clinicDayOf } from '@/lib/clinic-time';
import type { NotificationItem } from '@/lib/notifications/notification-api';

export type NotificationFilter = 'all' | 'unread' | 'appointment' | 'encounter';

export const NOTIFICATION_FILTERS: ReadonlyArray<NotificationFilter> = ['all', 'unread', 'appointment', 'encounter'];

/** What the list API gives plus the id of the booking, which a future payload may carry. */
export type NotificationSource = Pick<NotificationItem, 'category'> & { readonly appointmentId?: string | null };

export interface NotificationKind {
  /** Key in `patient.notifications` of the type label (the label always stays: colour is not the only signal). */
  readonly labelKey: string;
  readonly icon: LucideIcon;
  /** Tile colours, taken from the design tokens. */
  readonly tone: string;
}

const KINDS: Readonly<Record<string, NotificationKind>> = {
  appointment: { labelKey: 'categoryAppointment', icon: CalendarCheck, tone: 'bg-primary-soft text-primary-soft-foreground' },
  encounter: { labelKey: 'categoryEncounter', icon: ClipboardCheck, tone: 'bg-success-soft text-success' },
  registration: { labelKey: 'categoryRegistration', icon: UserPlus, tone: 'bg-warning-soft text-warning' },
};

const OTHER_KIND: NotificationKind = { labelKey: 'categoryOther', icon: MessageSquare, tone: 'bg-secondary text-muted-foreground' };

export function notificationKind(category: string): NotificationKind {
  return KINDS[category] ?? OTHER_KIND;
}

export interface NotificationAction {
  /** Key in `patientNotifications`. */
  readonly labelKey: string;
  readonly href: string;
}

/** Only to pages that exist: a booking needs its id in the payload, a finished visit goes to the history; otherwise nothing. */
export function notificationAction(source: NotificationSource): NotificationAction | null {
  if (source.category === 'appointment') {
    const id: string = (source.appointmentId ?? '').trim();
    return id === '' ? null : { labelKey: 'openAppointment', href: `/appointments/${encodeURIComponent(id)}` };
  }
  if (source.category === 'encounter') return { labelKey: 'openHistory', href: '/history' };
  return null;
}

/** Type filters are applied to the page that was read (the API only knows "unread"); "unread" is the server's job too. */
export function matchesFilter(item: Pick<NotificationItem, 'category' | 'read'>, filter: NotificationFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'unread') return !item.read;
  return item.category === filter;
}

export interface NotificationDay<TItem> {
  /** `YYYY-MM-DD` of the clinic day. */
  readonly dayKey: string;
  readonly items: ReadonlyArray<TItem>;
}

/** Groups by the calendar day in the clinic time zone, days and items in the order they come. */
export function groupByClinicDay<TItem extends Pick<NotificationItem, 'sent'>>(items: ReadonlyArray<TItem>): ReadonlyArray<NotificationDay<TItem>> {
  const days = new Map<string, TItem[]>();
  for (const item of items) {
    const key: string = clinicDayOf(item.sent);
    const bucket: TItem[] | undefined = days.get(key);
    if (bucket) bucket.push(item);
    else days.set(key, [item]);
  }
  return Array.from(days, ([dayKey, dayItems]) => ({ dayKey, items: dayItems }));
}
