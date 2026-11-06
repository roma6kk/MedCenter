// The clinic calendar is Europe/Minsk (UTC+3, no DST): day boundaries and displayed times never go through the browser zone.
import type { Locale } from '@/lib/i18n/locale';
import { useUiStore } from '@/store/use-ui-store';

export const CLINIC_TIME_ZONE = 'Europe/Minsk';

const FALLBACK_OFFSET = '+03:00';
const DAY_MS = 86_400_000;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EMBEDDED_INSTANT = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})/g;

export const INTL_LOCALE: Readonly<Record<Locale, string>> = { ru: 'ru-BY', en: 'en-GB' };

type FormatKind = 'dateTime' | 'instantDay' | 'time' | 'hour' | 'date' | 'dayMedium' | 'dayLong' | 'dayHeading' | 'dayShort' | 'weekdayShort';

const FORMAT_OPTIONS: Readonly<Record<FormatKind, Intl.DateTimeFormatOptions>> = {
  dateTime: { timeZone: CLINIC_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' },
  instantDay: { timeZone: CLINIC_TIME_ZONE, day: 'numeric', month: 'long' },
  time: { timeZone: CLINIC_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
  hour: { timeZone: CLINIC_TIME_ZONE, hour: '2-digit', hourCycle: 'h23' },
  date: { timeZone: CLINIC_TIME_ZONE, dateStyle: 'medium' },
  dayMedium: { timeZone: 'UTC', dateStyle: 'medium' },
  dayLong: { timeZone: 'UTC', dateStyle: 'long' },
  dayHeading: { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' },
  dayShort: { timeZone: 'UTC', day: 'numeric', month: 'short' },
  weekdayShort: { timeZone: 'UTC', weekday: 'short' },
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(kind: FormatKind, locale: Locale): Intl.DateTimeFormat {
  const cacheKey = `${kind}:${locale}`;
  const cached: Intl.DateTimeFormat | undefined = formatters.get(cacheKey);
  if (cached !== undefined) return cached;
  const created = new Intl.DateTimeFormat(INTL_LOCALE[locale], FORMAT_OPTIONS[kind]);
  formatters.set(cacheKey, created);
  return created;
}

export function currentLocale(): Locale {
  return useUiStore.getState().locale;
}

const numberFormatters = new Map<Locale, Intl.NumberFormat>();

// No digit grouping: a clinical value must not become «1 234,5».
export function formatNumber(value: number, locale: Locale = currentLocale()): string {
  if (!Number.isFinite(value)) return String(value);
  let formatter: Intl.NumberFormat | undefined = numberFormatters.get(locale);
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat(INTL_LOCALE[locale], { maximumFractionDigits: 6, useGrouping: false });
    numberFormatters.set(locale, formatter);
  }
  return formatter.format(value);
}

function validDate(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function keyToNoon(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00Z`);
}

// Day keys: arithmetic on the key itself in UTC, so it never drifts with a zone or DST.

export function isDateKey(value: string): boolean {
  if (!DATE_KEY_PATTERN.test(value)) return false;
  const parsed = keyToNoon(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

export function shiftDateKey(dateKey: string, days: number): string {
  if (!isDateKey(dateKey)) return dateKey;
  return new Date(keyToNoon(dateKey).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((keyToNoon(toKey).getTime() - keyToNoon(fromKey).getTime()) / DAY_MS);
}

let dayKeyFormatter: Intl.DateTimeFormat | null = null;

function dayKeyParts(date: Date): Intl.DateTimeFormatPart[] {
  dayKeyFormatter ??= new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
  return dayKeyFormatter.formatToParts(date);
}

export function clinicDateKey(date: Date = new Date()): string {
  if (Number.isNaN(date.getTime())) return '';
  const parts = dayKeyParts(date);
  const part = (type: string, fallback: string): string => parts.find((p) => p.type === type)?.value ?? fallback;
  return `${part('year', '0000')}-${part('month', '00')}-${part('day', '00')}`;
}

export function clinicDayOf(iso: string): string {
  return clinicDateKey(new Date(iso));
}

function clinicOffset(dateKey: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: CLINIC_TIME_ZONE, timeZoneName: 'longOffset' }).formatToParts(keyToNoon(dateKey));
    const name = parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
    return /GMT([+-]\d{2}:\d{2})/.exec(name)?.[1] ?? FALLBACK_OFFSET;
  } catch {
    // `longOffset` is missing in very old engines; the clinic zone has a fixed offset, so the fallback is exact.
    return FALLBACK_OFFSET;
  }
}

export interface DayBounds {
  readonly from: string;
  readonly to: string;
}

export function clinicDayBounds(dateKey: string): DayBounds {
  const offset = clinicOffset(dateKey);
  return { from: `${dateKey}T00:00:00${offset}`, to: `${dateKey}T23:59:59${offset}` };
}

export function ageInYears(birthDate: string, today: string = clinicDateKey()): number | null {
  if (!isDateKey(birthDate) || !isDateKey(today)) return null;
  const [birthYear, birthMonth, birthDay] = birthDate.split('-').map(Number) as [number, number, number];
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  const hadBirthday: boolean = month > birthMonth || (month === birthMonth && day >= birthDay);
  const age: number = year - birthYear - (hadBirthday ? 0 : 1);
  return age >= 0 ? age : null;
}

export function formatClinicDateTime(iso: string, locale: Locale = currentLocale()): string {
  const date = validDate(iso);
  return date === null ? iso : formatterFor('dateTime', locale).format(date);
}

export function formatClinicDayTime(iso: string, locale: Locale = currentLocale()): string {
  const date = validDate(iso);
  return date === null ? iso : `${formatterFor('instantDay', locale).format(date)}, ${formatterFor('time', locale).format(date)}`;
}

export function formatClinicTime(iso: string, locale: Locale = currentLocale()): string {
  const date = validDate(iso);
  return date === null ? iso : formatterFor('time', locale).format(date);
}

export function clinicHourOf(iso: string): number {
  const date = validDate(iso);
  return date === null ? 0 : Number.parseInt(formatterFor('hour', 'en').format(date), 10) || 0;
}

export type DayStyle = 'numeric' | 'medium' | 'long';

export function formatDateKey(dateKey: string, style: DayStyle = 'medium', locale: Locale = currentLocale()): string {
  if (!isDateKey(dateKey)) return dateKey;
  if (style === 'numeric') return dateKey.split('-').reverse().join('.');
  return formatterFor(style === 'long' ? 'dayLong' : 'dayMedium', locale).format(keyToNoon(dateKey));
}

export function formatClinicDate(value: string, locale: Locale = currentLocale()): string {
  if (DATE_KEY_PATTERN.test(value)) return formatDateKey(value, 'long', locale);
  const date = validDate(value);
  return date === null ? value : formatterFor('date', locale).format(date);
}

export function formatDayHeading(dateKey: string, locale: Locale = currentLocale(), style: 'long' | 'compact' = 'long'): string {
  if (!isDateKey(dateKey)) return dateKey;
  if (style === 'long') return formatterFor('dayHeading', locale).format(keyToNoon(dateKey));
  return `${formatterFor('weekdayShort', locale).format(keyToNoon(dateKey))}, ${formatDateKey(dateKey, 'numeric')}`;
}

export function formatDayShort(dateKey: string, locale: Locale = currentLocale()): string {
  return isDateKey(dateKey) ? formatterFor('dayShort', locale).format(keyToNoon(dateKey)) : dateKey;
}

export function formatWeekdayShort(dateKey: string, locale: Locale = currentLocale()): string {
  return isDateKey(dateKey) ? formatterFor('weekdayShort', locale).format(keyToNoon(dateKey)) : dateKey;
}

export function localizeInstants(text: string, locale: Locale = currentLocale()): string {
  return text.replace(EMBEDDED_INSTANT, (instant) => formatClinicDateTime(instant, locale));
}

export interface SlotDay<TSlot> {
  readonly day: string;
  readonly slots: ReadonlyArray<TSlot>;
}

export function groupSlotsByDay<TSlot extends { readonly start: string }>(slots: ReadonlyArray<TSlot>): ReadonlyArray<SlotDay<TSlot>> {
  const byDay = new Map<string, TSlot[]>();
  slots
    .map((slot) => ({ slot, startMs: Date.parse(slot.start) }))
    .sort((a, b) => a.startMs - b.startMs)
    .forEach(({ slot, startMs }) => {
      const day: string = clinicDateKey(new Date(startMs));
      const bucket: TSlot[] | undefined = byDay.get(day);
      if (bucket === undefined) byDay.set(day, [slot]);
      else bucket.push(slot);
    });
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, daySlots]) => ({ day, slots: daySlots }));
}
