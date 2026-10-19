/**
 * admin-dates — calendar-day arithmetic for the admin screens.
 *
 * Days travel as `YYYY-MM-DD` keys (what `<input type="date">` and the API use). All arithmetic happens in UTC on the
 * key itself, so it never drifts with the browser zone; "today" and slot times are shown in the clinic zone (Europe/Minsk).
 */
import type { Locale } from '@/lib/i18n/locale';
import { minskDateKey } from '@/lib/utils';

const DAY_MS = 86_400_000;
const CLINIC_TIME_ZONE = 'Europe/Minsk';

/** The `Intl` locale of a UI locale: Russian dates for `ru`, English ones for `en`. */
const INTL_LOCALES: Readonly<Record<Locale, string>> = { ru: 'ru-BY', en: 'en-GB' };

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Built once per kind and locale: constructing an `Intl.DateTimeFormat` costs ~0.1 ms and the slot grid formats thousands of values. */
function formatterFor(kind: string, locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const cacheKey = `${kind}|${locale}`;
  const cached: Intl.DateTimeFormat | undefined = formatters.get(cacheKey);
  if (cached !== undefined) return cached;
  const created = new Intl.DateTimeFormat(INTL_LOCALES[locale], options);
  formatters.set(cacheKey, created);
  return created;
}

function keyToUtcMs(key: string): number {
  return Date.parse(`${key}T00:00:00.000Z`);
}

export function todayKey(now: Date = new Date()): string {
  return minskDateKey(now);
}

export function addDays(key: string, days: number): string {
  return new Date(keyToUtcMs(key) + days * DAY_MS).toISOString().slice(0, 10);
}

/** `to - from` in whole days (negative when `to` is before `from`); `NaN` for an unreadable key. */
export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((keyToUtcMs(toKey) - keyToUtcMs(fromKey)) / DAY_MS);
}

/** `2026-10-16` → `16.10.2026`. */
export function formatDateKey(key: string): string {
  const [year, month, day] = key.split('-');
  return `${day ?? ''}.${month ?? ''}.${year ?? ''}`;
}

/** The clinic day (`YYYY-MM-DD`) an instant falls on. */
export function clinicDayOf(iso: string): string {
  return minskDateKey(new Date(iso));
}

/** `HH:mm` of an instant in the clinic zone. */
export function clinicTimeOf(iso: string): string {
  return formatterFor('time', 'ru', { timeZone: CLINIC_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

/** `вт, 20.10.2026` (`Tue, 20.10.2026` in English) for a day key. */
export function formatDayHeading(key: string, locale: Locale = 'ru'): string {
  const weekday: string = formatterFor('weekday', locale, { timeZone: 'UTC', weekday: 'short' }).format(new Date(keyToUtcMs(key)));
  return `${weekday}, ${formatDateKey(key)}`;
}

/** `19 окт. 2026 г., 14:05` (`19 Oct 2026, 14:05`) of an instant in the clinic zone, in the language of the interface. */
export function formatClinicDateTime(iso: string, locale: Locale = 'ru'): string {
  return formatterFor('date-time', locale, { timeZone: CLINIC_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}
