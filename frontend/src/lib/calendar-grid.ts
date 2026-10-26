/**
 * calendar-grid — pure calendar arithmetic for the date picker, on `YYYY-MM-DD` keys (no zone, no `Date` in the local zone:
 * a day is read as UTC noon, so DST and the browser's zone never move it). Weeks start on Monday, as in the clinic's locale.
 */
import type { Locale } from '@/lib/i18n/locale';
import { INTL_LOCALE, isDateKey, shiftDateKey } from './clinic-time';

export interface DayCell {
  readonly key: string;
  /** `false` for a day of the previous or next month shown to complete the week. */
  readonly inMonth: boolean;
}

export const WEEK_DAYS = 7;
const GRID_WEEKS = 6;
const TYPED_DATE = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/;
const pad = (value: number, length: number): string => String(value).padStart(length, '0');

export interface DateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** Year, month (1-12) and day of a valid key. */
export function partsOf(key: string): DateParts {
  const [year, month, day] = key.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

export function keyOf({ year, month, day }: DateParts): string {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** `dd.mm.yyyy` of a key (what the date field shows); text that is not a day is returned as it was. */
export function formatTypedDate(key: string): string {
  return isDateKey(key) ? key.split('-').reverse().join('.') : key;
}

/**
 * The day a visitor typed: the ISO key itself or `д.м.гггг` (also with `/` or `-`), `null` when it is not a real day.
 * Both readings are accepted so a browser's autofill (`bday`) and a pasted ISO date keep working.
 */
export function parseTypedDate(text: string): string | null {
  const trimmed: string = text.trim();
  if (isDateKey(trimmed)) return trimmed;
  const match = TYPED_DATE.exec(trimmed);
  if (match === null) return null;
  const key: string = `${match[3]}-${pad(Number(match[2]), 2)}-${pad(Number(match[1]), 2)}`;
  return isDateKey(key) ? key : null;
}

/** The same day number `months` later (earlier when negative); the last day of a shorter month when it does not exist there. */
export function addMonths(key: string, months: number): string {
  const { year, month, day } = partsOf(key);
  const index: number = year * 12 + (month - 1) + months;
  const nextYear: number = Math.floor(index / 12);
  const nextMonth: number = (index % 12) + 1;
  return keyOf({ year: nextYear, month: nextMonth, day: Math.min(day, daysInMonth(nextYear, nextMonth)) });
}

/** 0 for Monday … 6 for Sunday. */
export function weekdayIndex(key: string): number {
  return (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % WEEK_DAYS;
}

/** Keeps `key` inside `[min, max]` (either bound may be absent or unreadable). */
export function clampKey(key: string, min?: string, max?: string): string {
  if (min !== undefined && isDateKey(min) && key < min) return min;
  if (max !== undefined && isDateKey(max) && key > max) return max;
  return key;
}

/** Six full weeks (Monday first) that contain the month of `key`: a fixed height, so the popover does not jump between months. */
export function monthGrid(key: string): ReadonlyArray<ReadonlyArray<DayCell>> {
  const { year, month } = partsOf(key);
  const first: string = keyOf({ year, month, day: 1 });
  const start: string = shiftDateKey(first, -weekdayIndex(first));
  return Array.from({ length: GRID_WEEKS }, (_, week) =>
    Array.from({ length: WEEK_DAYS }, (_, day): DayCell => {
      const cell: string = shiftDateKey(start, week * WEEK_DAYS + day);
      return { key: cell, inMonth: cell.startsWith(first.slice(0, 7)) };
    }),
  );
}

const nameCache = new Map<string, ReadonlyArray<string>>();

/** Names from `Intl` (never hard-coded, so both languages and any later locale come for free); built once per kind and locale. */
function names(kind: 'month' | 'weekdayShort' | 'weekdayLong', locale: Locale): ReadonlyArray<string> {
  const cacheKey: string = `${kind}:${locale}`;
  const cached: ReadonlyArray<string> | undefined = nameCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const options: Intl.DateTimeFormatOptions =
    kind === 'month' ? { month: 'long', timeZone: 'UTC' } : { weekday: kind === 'weekdayShort' ? 'short' : 'long', timeZone: 'UTC' };
  const format = new Intl.DateTimeFormat(INTL_LOCALE[locale], options);
  // 2024-01-01 is a Monday: seven consecutive days give the week in Monday-first order; the 1st of each month gives the months.
  const created: ReadonlyArray<string> =
    kind === 'month'
      ? Array.from({ length: 12 }, (_, index) => format.format(new Date(Date.UTC(2024, index, 1, 12))))
      : Array.from({ length: WEEK_DAYS }, (_, index) => format.format(new Date(Date.UTC(2024, 0, 1 + index, 12))));
  nameCache.set(cacheKey, created);
  return created;
}

/** The twelve month names, January first (nominative: `октябрь`). */
export function monthNames(locale: Locale): ReadonlyArray<string> {
  return names('month', locale);
}

/** Weekday names, Monday first: short (`пн`) for the column heads, long (`понедельник`) for their `abbr`. */
export function weekdayNames(locale: Locale, style: 'short' | 'long'): ReadonlyArray<string> {
  return names(style === 'short' ? 'weekdayShort' : 'weekdayLong', locale);
}
