import type { AppointmentStatusCode } from './analytics-types';

export type DeltaDirection = 'up' | 'down' | 'flat';

interface Delta {
  readonly direction: DeltaDirection;
  readonly change: number;
  readonly percent: number | null;
}

export function deltaOf(current: number, previous: number): Delta {
  const change: number = current - previous;
  const direction: DeltaDirection = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  return { direction, change, percent: previous > 0 ? Math.round((Math.abs(change) * 100) / previous) : null };
}

export type DeltaTone = 'good' | 'bad' | 'neutral';

export function deltaTone(status: AppointmentStatusCode | 'total', direction: DeltaDirection): DeltaTone {
  if (direction === 'flat' || status === 'total' || status === 'booked') return 'neutral';
  const upIsGood: boolean = status === 'fulfilled';
  return (direction === 'up') === upIsGood ? 'good' : 'bad';
}
