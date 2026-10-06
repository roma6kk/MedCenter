import type { ReactNode } from 'react';

export type AppointmentStatus = 'booked' | 'cancelled' | 'noshow' | 'fulfilled';
export type SlotStatus = 'free' | 'busy';

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
  fulfilled: 'var(--success)',
  finished: 'var(--success)',
  active: 'var(--success)',
  completed: 'var(--success)',
  cancelled: 'var(--destructive)',
  noshow: 'var(--warning)',
};

export function StampBadge({ status, children }: StampBadgeProps): ReactNode {
  const color = STATUS_COLOR[status] ?? 'var(--muted-foreground)';
  return (
    <span
      data-testid={`stamp-${status}`}
      style={{ borderColor: color, color }}
      className="inline-block rounded-[6px] border-[1.5px] bg-transparent px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.08em]"
    >
      {children ?? status.toUpperCase()}
    </span>
  );
}
