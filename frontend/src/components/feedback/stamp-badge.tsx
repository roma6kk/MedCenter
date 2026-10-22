'use client';

import type { ReactNode } from 'react';
import { hasMessage } from '@/lib/i18n/translate';
import { useT } from '@/lib/i18n/use-t';
import { useUiStore } from '@/store/use-ui-store';

export type AppointmentStatus = 'booked' | 'cancelled' | 'noshow' | 'fulfilled';
/** `entered-in-error` is what the admin slot API returns when it is asked for it explicitly (`?status=entered-in-error`). */
export type SlotStatus = 'free' | 'busy' | 'entered-in-error';

export type StampStatus = AppointmentStatus | SlotStatus | 'proposed' | 'pending' | 'arrived' | 'checked-in' | 'finished' | 'active' | 'completed';

interface StampBadgeProps {
  readonly status: StampStatus;
  readonly children?: ReactNode;
}

const STATUS_COLOR: Record<StampStatus, string> = {
  booked: 'var(--primary)',
  proposed: 'var(--primary)',
  pending: 'var(--warning)',
  arrived: 'var(--primary)',
  'checked-in': 'var(--primary)',
  free: 'var(--success)',
  busy: 'var(--muted-foreground)',
  'entered-in-error': 'var(--muted-foreground)',
  fulfilled: 'var(--success)',
  finished: 'var(--success)',
  active: 'var(--success)',
  completed: 'var(--success)',
  cancelled: 'var(--destructive)',
  noshow: 'var(--warning)',
};

/** Status "stamp" of the medical-card design system. The label is localized (`stamp.<status>`) unless children are given. */
export function StampBadge({ status, children }: StampBadgeProps): ReactNode {
  const t = useT('stamp');
  const locale = useUiStore((state) => state.locale);
  const color: string = STATUS_COLOR[status] ?? 'var(--muted-foreground)';
  return (
    <span
      data-testid={`stamp-${status}`}
      style={{ borderColor: color, color }}
      className="inline-block rounded-full border-[1.5px] bg-transparent px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.08em]"
    >
      {children ?? (hasMessage(locale, `stamp.${status}`) ? t(status) : status)}
    </span>
  );
}
