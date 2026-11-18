import { CalendarCheck, ClipboardCheck, MessageSquare, UserPlus, type LucideIcon } from 'lucide-react';
import { clinicDayOf } from '@/lib/clinic-time';
import type { NotificationItem } from '@/lib/notifications/notification-api';

export type NotificationFilter = 'all' | 'unread' | 'appointment' | 'encounter';

export const NOTIFICATION_FILTERS: ReadonlyArray<NotificationFilter> = ['all', 'unread', 'appointment', 'encounter'];

type NotificationSource = Pick<NotificationItem, 'category'> & { readonly appointmentId?: string | null };

interface NotificationKind {
  readonly labelKey: string;
  readonly icon: LucideIcon;
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

interface NotificationAction {
  readonly labelKey: string;
  readonly href: string;
}

export function notificationAction(source: NotificationSource): NotificationAction | null {
  if (source.category === 'appointment') {
    const id: string = (source.appointmentId ?? '').trim();
    return id === '' ? null : { labelKey: 'openAppointment', href: `/appointments/${encodeURIComponent(id)}` };
  }
  if (source.category === 'encounter') return { labelKey: 'openHistory', href: '/medcard' };
  return null;
}

export function matchesFilter(item: Pick<NotificationItem, 'category' | 'read'>, filter: NotificationFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'unread') return !item.read;
  return item.category === filter;
}

interface NotificationDay<TItem> {
  readonly dayKey: string;
  readonly items: ReadonlyArray<TItem>;
}

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
