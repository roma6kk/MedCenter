import type { AppointmentStatusCode } from './analytics-types';

export type DeltaDirection = 'up' | 'down' | 'flat';

/** What changed against the period before, kept as numbers so the view words it. `null` percent: there was nothing before to divide by. */
export interface Delta {
  readonly direction: DeltaDirection;
  /** Signed difference of the counts. */
  readonly change: number;
  readonly percent: number | null;
}

export function deltaOf(current: number, previous: number): Delta {
  const change: number = current - previous;
  const direction: DeltaDirection = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  return { direction, change, percent: previous > 0 ? Math.round((Math.abs(change) * 100) / previous) : null };
}

export type DeltaTone = 'good' | 'bad' | 'neutral';

/** Whether a change is good news: more attended visits is, more cancellations and no-shows are not; the totals just move. */
export function deltaTone(status: AppointmentStatusCode | 'total', direction: DeltaDirection): DeltaTone {
  if (direction === 'flat' || status === 'total' || status === 'booked') return 'neutral';
  const upIsGood: boolean = status === 'fulfilled';
  return (direction === 'up') === upIsGood ? 'good' : 'bad';
}
