import type { AppointmentStatusCode } from './analytics-types';

/**
 * How a status looks in the charts: attended = success, cancelled = destructive, no-show = warning, as in `StampBadge`; booked is
 * info (blue) here, not the badge's primary teal, because teal and the success green sit too close to tell apart in a stacked
 * column. The no-show mark is also hatched (see `appointments-chart.tsx`): the red of a cancellation and the orange of a no-show
 * are close for colour-blind readers.
 */
export const STATUS_KEY_CLASS: Readonly<Record<AppointmentStatusCode, string>> = {
  booked: 'bg-info',
  fulfilled: 'bg-success',
  cancelled: 'bg-destructive',
  noshow: 'bg-warning',
};

/** The no-show key carries the same hatch as its columns. */
export const HATCH_KEY_STYLE = { backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 2px, var(--card) 2px 4px)' } as const;
