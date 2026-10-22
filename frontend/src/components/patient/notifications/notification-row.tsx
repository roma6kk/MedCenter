'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { useT } from '@/lib/i18n/use-t';
import type { NotificationItem } from '@/lib/notifications/notification-api';
import { cn } from '@/lib/ui/cn';
import { WRAP_TEXT } from '../wrap-text';
import { notificationAction, notificationKind } from './notification-logic';

export interface NotificationRowProps {
  readonly item: NotificationItem;
  /** The id being marked right now, so only its button shows the busy state. */
  readonly markingId: string | null;
  readonly onMarkRead: (id: string) => void;
}

/** One notification: a soft tile with the type icon, the type label (never colour alone), the time, the text and its actions. */
export function NotificationRow({ item, markingId, onMarkRead }: NotificationRowProps): ReactNode {
  const t = useT('patient.notifications');
  const tn = useT('patientNotifications');
  const format = useClinicFormat();
  const kind = notificationKind(item.category);
  const action = notificationAction(item);
  const Icon = kind.icon;
  const isMarking: boolean = markingId === item.id;
  return (
    <li className={cn('flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border px-5 py-4 first:border-t-0', item.read ? 'bg-card' : 'bg-secondary/40')}>
      <span aria-hidden="true" className={cn('inline-flex size-11 flex-none items-center justify-center rounded-control', kind.tone)}>
        <Icon className="size-5" />
      </span>
      <div className="flex min-w-0 flex-[999_1_260px] flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          <span className="font-bold uppercase tracking-wider">{t(kind.labelKey)}</span>
          <time dateTime={item.sent} className="font-mono">{format.time(item.sent)}</time>
          {item.read ? null : (
            <span className="inline-flex items-center gap-1.5 font-bold text-primary-soft-foreground">
              <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
              {t('unread')}
            </span>
          )}
        </p>
        <p id={`notification-${item.id}-text`} className={cn('text-base', WRAP_TEXT, item.read ? 'font-normal' : 'font-semibold')}>{format.prose(item.text)}</p>
      </div>
      <div className="no-print flex flex-none items-center gap-2">
        {action ? (
          <Link href={action.href} aria-describedby={`notification-${item.id}-text`} className={buttonVariants({ variant: 'secondary' })}>
            {tn(action.labelKey)}
          </Link>
        ) : null}
        {item.read ? null : (
          <button
            type="button"
            disabled={isMarking}
            aria-label={isMarking ? t('marking') : t('markRead')}
            aria-describedby={`notification-${item.id}-text`}
            onClick={() => onMarkRead(item.id)}
            className="inline-flex size-11 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check aria-hidden="true" className="size-5" strokeWidth={2.2} />
          </button>
        )}
      </div>
    </li>
  );
}
