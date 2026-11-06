import type { Locale } from '@/lib/i18n/locale';
import { INTL_LOCALE, formatDateKey, isDateKey, shiftDateKey } from './clinic-time';

export interface DayCell {
  readonly key: string;
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

export function formatTypedDate(key: string): string {
  return formatDateKey(key, 'numeric');
}

export function parseTypedDate(text: string): string | null {
  const trimmed = text.trim();
  if (isDateKey(trimmed)) return trimmed;
  const match = TYPED_DATE.exec(trimmed);
  if (match === null) return null;
  const key = `${match[3]}-${pad(Number(match[2]), 2)}-${pad(Number(match[1]), 2)}`;
  return isDateKey(key) ? key : null;
}

export function addMonths(key: string, months: number): string {
  const { year, month, day } = partsOf(key);
  const index = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return keyOf({ year: nextYear, month: nextMonth, day: Math.min(day, daysInMonth(nextYear, nextMonth)) });
}

export function weekdayIndex(key: string): number {
  return (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % WEEK_DAYS;
}

export function clampKey(key: string, min?: string, max?: string): string {
  if (min !== undefined && isDateKey(min) && key < min) return min;
  if (max !== undefined && isDateKey(max) && key > max) return max;
  return key;
}

export function monthGrid(key: string): ReadonlyArray<ReadonlyArray<DayCell>> {
  const { year, month } = partsOf(key);
  const first = keyOf({ year, month, day: 1 });
  const start = shiftDateKey(first, -weekdayIndex(first));
  return Array.from({ length: GRID_WEEKS }, (_, week) =>
    Array.from({ length: WEEK_DAYS }, (_, day): DayCell => {
      const cell = shiftDateKey(start, week * WEEK_DAYS + day);
      return { key: cell, inMonth: cell.startsWith(first.slice(0, 7)) };
    }),
  );
}

const nameCache = new Map<string, ReadonlyArray<string>>();

function names(kind: 'month' | 'weekdayShort' | 'weekdayLong', locale: Locale): ReadonlyArray<string> {
  const cacheKey = `${kind}:${locale}`;
  const cached = nameCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const options: Intl.DateTimeFormatOptions =
    kind === 'month' ? { month: 'long', timeZone: 'UTC' } : { weekday: kind === 'weekdayShort' ? 'short' : 'long', timeZone: 'UTC' };
  const format = new Intl.DateTimeFormat(INTL_LOCALE[locale], options);
  const created =
    kind === 'month'
      ? Array.from({ length: 12 }, (_, index) => format.format(new Date(Date.UTC(2024, index, 1, 12))))
      : Array.from({ length: WEEK_DAYS }, (_, index) => format.format(new Date(Date.UTC(2024, 0, 1 + index, 12))));
  nameCache.set(cacheKey, created);
  return created;
}

export function monthNames(locale: Locale): ReadonlyArray<string> {
  return names('month', locale);
}

export function weekdayNames(locale: Locale, style: 'short' | 'long'): ReadonlyArray<string> {
  return names(style === 'short' ? 'weekdayShort' : 'weekdayLong', locale);
}
