import { daysInMonth, keyOf, partsOf, weekdayIndex } from '@/lib/calendar-grid';
import { daysBetween, shiftDateKey } from '@/lib/clinic-time';
import type { ReportRange } from '../shared/report-range';

type Granularity = 'day' | 'week' | 'month';

export interface Bucket extends ReportRange {
  readonly granularity: Granularity;
}

const DAY_BUCKETS_MAX_DAYS = 31;
const WEEK_BUCKETS_MAX_DAYS = 93;

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
