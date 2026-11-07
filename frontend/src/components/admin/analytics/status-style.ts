import type { AppointmentStatusCode } from './analytics-types';

export const STATUS_KEY_CLASS: Readonly<Record<AppointmentStatusCode, string>> = {
  booked: 'bg-info',
  fulfilled: 'bg-success',
  cancelled: 'bg-destructive',
  noshow: 'bg-warning',
};

export const HATCH_KEY_STYLE = { backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 2px, var(--card) 2px 4px)' } as const;
