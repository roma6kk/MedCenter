/**
 * analytics-series — how a period is cut into the columns of the «appointments over time» chart.
 *
 * The analytics service answers one aggregate per period (API §9.1) and has no time series, so each column is one more
 * request for its own sub-period. The cut keeps that to a few requests: a day each up to a month, a week each up to three
 * months, a calendar month each beyond (at most 13 for a year).
 */
import { daysInMonth, keyOf, partsOf, weekdayIndex } from '@/lib/calendar-grid';
import { daysBetween, shiftDateKey } from '@/lib/clinic-time';
import type { ReportRange } from '../shared/report-range';

export type Granularity = 'day' | 'week' | 'month';

export interface Bucket extends ReportRange {
  readonly granularity: Granularity;
}

/** Up to this many days a column is a day. */
export const DAY_BUCKETS_MAX_DAYS = 31;
/** Up to this many days a column is a week. */
export const WEEK_BUCKETS_MAX_DAYS = 93;

export function granularityOf(range: ReportRange): Granularity {
  const days: number = daysBetween(range.from, range.to) + 1;
  if (days <= DAY_BUCKETS_MAX_DAYS) return 'day';
  return days <= WEEK_BUCKETS_MAX_DAYS ? 'week' : 'month';
}

function endOfBucket(granularity: Granularity, from: string): string {
  if (granularity === 'day') return from;
  if (granularity === 'week') return shiftDateKey(from, 6 - weekdayIndex(from));
  const { year, month } = partsOf(from);
  return keyOf({ year, month, day: daysInMonth(year, month) });
}

/** The columns of a period, first to last; the first and the last one are cut to the period's own ends. */
export function bucketsOf(range: ReportRange): ReadonlyArray<Bucket> {
  const granularity: Granularity = granularityOf(range);
  const buckets: Bucket[] = [];
  let from: string = range.from;
  while (from <= range.to) {
    const natural: string = endOfBucket(granularity, from);
    const to: string = natural < range.to ? natural : range.to;
    buckets.push({ from, to, granularity });
    from = shiftDateKey(to, 1);
  }
  return buckets;
}
