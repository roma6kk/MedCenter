'use client';

import { useCallback, useId, useRef, useState } from 'react';
import type { FocusEvent, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Bell } from 'lucide-react';
import { useUnreadCount } from '@/lib/notifications/use-notifications';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { useSessionStore } from '@/store/use-session-store';
import { NotificationBellPanel } from './notification-bell-panel';
import { useCountPulse } from './use-count-pulse';

const BADGE_CAP = 99;

function UnreadBadge({ count, isPulsing }: { readonly count: number; readonly isPulsing: boolean }): ReactNode {
  const t = useT('layout.notifications');
  if (count <= 0) return null;
  return (
    <span
      data-testid="unread-badge"
      data-pulsing={isPulsing ? 'true' : undefined}
      aria-hidden="true"
      className={cn(
        'absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-bold text-destructive-foreground',
        isPulsing && 'animate-badge-pulse',
      )}
    >
      {count > BADGE_CAP ? t('overflow') : count}
    </span>
  );
}

/**
 * The patient's entry to the notifications (patient only): a bell with the unread count that opens a dropdown of the latest
 * five, with «Отметить все прочитанными» and the link to the whole list. The count is polled every 30 s (ADR-015) through
 * `useUnreadCount`, and its badge pulses softly when a new one arrives. Renders nothing for doctors and administrators, who
 * have no notification endpoints.
 */
export function NotificationBell(): ReactNode {
  const t = useT('layout.notifications');
  const role = useSessionStore((state) => state.role);
  const pathname: string | null = usePathname();
  const { data } = useUnreadCount();
  const isPulsing: boolean = useCountPulse(data);
  const [isOpen, setIsOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId: string = useId();
  const close = useCallback((restoreFocus: boolean): void => {
    setIsOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }, []);
  // Tabbing past the last control of the dropdown leaves it: it closes instead of hanging open over the page.
  const onBlur = (event: FocusEvent<HTMLElement>): void => {
    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
  };
  if (role !== 'PATIENT') return null;

  const count: number = data ?? 0;
  const isCurrent: boolean = pathname !== null && (pathname === '/notifications' || pathname.startsWith('/notifications/'));
  return (
    <span className="relative inline-flex" onBlur={onBlur}>
      <button
        ref={trigger}
        type="button"
        aria-label={t('label', { count })}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        aria-current={isCurrent ? 'page' : undefined}
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          'relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-control border border-border text-foreground transition-[background-color] duration-fast ease-out hover:bg-secondary aria-expanded:bg-secondary',
          isCurrent && 'bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft',
        )}
      >
        <Bell size={20} strokeWidth={2} aria-hidden="true" />
        <UnreadBadge count={count} isPulsing={isPulsing} />
      </button>
      <span role="status" className="sr-only">
        {t('announce', { count })}
      </span>
      {isOpen ? <NotificationBellPanel id={panelId} trigger={trigger.current} unreadCount={count} onClose={close} /> : null}
    </span>
  );
}
