import { isCalendarDate } from '@/lib/contracts';
import { clinicDateKey, daysBetween, shiftDateKey } from '@/lib/clinic-time';

export interface ReportRange {
  readonly from: string;
  readonly to: string;
}

export type ReportRangeError = 'invalid' | 'order' | 'span';

export const MAX_REPORT_DAYS = 366;

export const DEFAULT_AUDIT_DAYS = 30;

export function currentYearRange(today: string = clinicDateKey()): ReportRange {
  const year: string = today.slice(0, 4);
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function lastDaysRange(days: number, today: string = clinicDateKey()): ReportRange {
  return { from: shiftDateKey(today, -(days - 1)), to: today };
}

export function validateReportRange(range: ReportRange): ReportRangeError | null {
  if (!isCalendarDate(range.from) || !isCalendarDate(range.to)) return 'invalid';
  const span: number = daysBetween(range.from, range.to);
  if (span < 0) return 'order';
  if (span + 1 > MAX_REPORT_DAYS) return 'span';
  return null;
}
