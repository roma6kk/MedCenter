/** Whole minutes between two instants; a start in the future (a clock that is a little off) counts as zero. */
export function elapsedMinutes(startIso: string, now: number): number {
  const start: number = Date.parse(startIso);
  return Number.isNaN(start) ? 0 : Math.max(0, Math.floor((now - start) / 60_000));
}

export interface DurationParts {
  readonly kind: 'minutes' | 'hours' | 'days';
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
}

/** Splits minutes into what is read out: «23 мин», «1 ч 05 мин», and past a day «1 сут 3 ч» (a visit left open overnight). */
export function durationParts(totalMinutes: number): DurationParts {
  const days: number = Math.floor(totalMinutes / 1440);
  const hours: number = Math.floor((totalMinutes % 1440) / 60);
  const minutes: number = totalMinutes % 60;
  return { kind: days > 0 ? 'days' : hours > 0 ? 'hours' : 'minutes', days, hours, minutes };
}
