'use client';

import type { ReactNode } from 'react';
import { Bell } from 'lucide-react';
import { NavLink } from './nav-link';
import { useUnreadCount } from '@/lib/notifications/use-notifications';
import { useT } from '@/lib/i18n/use-t';
import { useSessionStore } from '@/store/use-session-store';

const BADGE_CAP = 99;

function UnreadBadge({ count }: { readonly count: number }): ReactNode {
  const t = useT('layout.notifications');
  if (count <= 0) return null;
  return (
    <span
      data-testid="unread-badge"
      aria-hidden="true"
      className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold text-white"
    >
      {count > BADGE_CAP ? t('overflow') : count}
    </span>
  );
}

/**
 * The patient's one entry to the notifications (patient only): a bell with the unread count, current-page aware like the
 * other links. Polls `GET /api/v1/notifications/unread-count` every 30 s (ADR-015) through `useUnreadCount`; renders
 * nothing for doctors and administrators, who have no notification endpoints.
 */
export function NotificationBell(): ReactNode {
  const t = useT('layout.notifications');
  const role = useSessionStore((state) => state.role);
  const { data } = useUnreadCount();
  if (role !== 'PATIENT') return null;

  const count: number = data ?? 0;
  return (
    <span className="relative inline-flex">
      <NavLink href="/notifications" label={t('label', { count })} className="relative min-w-[44px] justify-center rounded-control border border-border text-foreground hover:bg-secondary">
        <Bell size={20} strokeWidth={2} aria-hidden="true" />
        <UnreadBadge count={count} />
      </NavLink>
      <span role="status" className="sr-only">
        {t('announce', { count })}
      </span>
    </span>
  );
}
