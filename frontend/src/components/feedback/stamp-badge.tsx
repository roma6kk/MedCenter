'use client';

import type { ReactNode } from 'react';
import { Ban, CalendarClock, CircleAlert, CircleCheck, CircleX, Hourglass, UserX, type LucideIcon } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { hasMessage } from '@/lib/i18n/translate';
import { useT } from '@/lib/i18n/use-t';
import { useUiStore } from '@/store/use-ui-store';

export type AppointmentStatus = 'booked' | 'cancelled' | 'noshow' | 'fulfilled';
export type SlotStatus = 'free' | 'busy' | 'entered-in-error';

export type StampStatus = AppointmentStatus | SlotStatus | 'proposed' | 'pending' | 'arrived' | 'checked-in' | 'finished' | 'active' | 'completed';

interface StampBadgeProps {
  readonly status: StampStatus;
  readonly children?: ReactNode;
  readonly tone?: BadgeTone;
  readonly icon?: LucideIcon;
  readonly className?: string | undefined;
}

interface StatusLook {
  readonly tone: BadgeTone;
  readonly icon: LucideIcon;
}

const BOOKED_LOOK: StatusLook = { tone: 'primary', icon: CalendarClock };
const DONE_LOOK: StatusLook = { tone: 'success', icon: CircleCheck };

const STATUS_LOOK: Readonly<Record<StampStatus, StatusLook>> = {
  booked: BOOKED_LOOK,
  proposed: BOOKED_LOOK,
  arrived: BOOKED_LOOK,
  'checked-in': BOOKED_LOOK,
  pending: { tone: 'warning', icon: Hourglass },
  free: DONE_LOOK,
  fulfilled: DONE_LOOK,
  finished: DONE_LOOK,
  active: DONE_LOOK,
  completed: DONE_LOOK,
  busy: { tone: 'neutral', icon: Ban },
  'entered-in-error': { tone: 'neutral', icon: CircleAlert },
  cancelled: { tone: 'critical', icon: CircleX },
  noshow: { tone: 'warning', icon: UserX },
};

const UNKNOWN_LOOK: StatusLook = { tone: 'neutral', icon: CircleAlert };

export function StampBadge({ status, children, tone, icon, className }: StampBadgeProps): ReactNode {
  const t = useT('stamp');
  const locale = useUiStore((state) => state.locale);
  const look: StatusLook = STATUS_LOOK[status] ?? UNKNOWN_LOOK;
  return (
    <Badge data-testid={`stamp-${status}`} tone={tone ?? look.tone} icon={icon ?? look.icon} className={className}>
      {children ?? (hasMessage(locale, `stamp.${status}`) ? t(status) : status)}
    </Badge>
  );
}
