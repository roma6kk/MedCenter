/**
 * report-range — the `from`…`to` period of the analytics reports and the audit journal (api-designer-spec §9).
 *
 * Both bounds are calendar days (`YYYY-MM-DD`, what `<input type="date">` gives and the API accepts). The server counts a
 * date-only `to` as the whole day, so a period of N days has `daysBetween(from, to) === N - 1` and may span at most 366 days.
 */
import { isCalendarDate } from '@/lib/contracts';
import { clinicDateKey, daysBetween, shiftDateKey } from '@/lib/clinic-time';

export interface ReportRange {
  readonly from: string;
  readonly to: string;
}

export type ReportRangeError = 'invalid' | 'order' | 'span';

/** A period may cover at most this many calendar days, both ends included (API §9: 366 days). */
export const MAX_REPORT_DAYS = 366;

/** What the audit journal shows when no period is chosen: the server's own default window of the last 30 days. */
export const DEFAULT_AUDIT_DAYS = 30;

/** 1 January – 31 December of the clinic's current year: the natural scope of the dashboard. */
export function currentYearRange(today: string = clinicDateKey()): ReportRange {
  const year: string = today.slice(0, 4);
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** The last `days` days up to and including `today`. */
export function lastDaysRange(days: number, today: string = clinicDateKey()): ReportRange {
  return { from: shiftDateKey(today, -(days - 1)), to: today };
}

/** `null` when the period can be sent; otherwise why not (the message key is `admin.<screen>.errors.<reason>`). */
export function validateReportRange(range: ReportRange): ReportRangeError | null {
  if (!isCalendarDate(range.from) || !isCalendarDate(range.to)) return 'invalid';
  const span: number = daysBetween(range.from, range.to);
  if (span < 0) return 'order';
  if (span + 1 > MAX_REPORT_DAYS) return 'span';
  return null;
}
