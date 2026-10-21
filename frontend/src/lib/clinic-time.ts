/**
 * clinic-time — the one module that knows the clinic's calendar: Europe/Minsk (UTC+3, no DST since 2011).
 *
 * The API speaks RFC 3339 instants and `YYYY-MM-DD` day keys. A patient, a doctor and an administrator all think in
 * clinic days, so every day boundary sent to the API, every day an instant belongs to and every time shown on screen goes
 * through here — never through the browser's own zone. Formatters take an optional locale (the UI locale by default),
 * are built once per kind and locale (`Intl.DateTimeFormat` costs ~0.1 ms, and the slot grid formats thousands of
 * values), and never throw: a value that is not a date comes back as it was, because blanking a whole page over one bad
 * field is worse than showing the raw text.
 */
import type { Locale } from '@/lib/i18n/locale';
import { useUiStore } from '@/store/use-ui-store';

export const CLINIC_TIME_ZONE = 'Europe/Minsk';

const FALLBACK_OFFSET = '+03:00';
const DAY_MS = 86_400_000;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** An RFC 3339 instant embedded in server prose, e.g. `Начало: 2026-10-19T11:40:00.000Z`. */
const EMBEDDED_INSTANT = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})/g;

/** BCP 47 tag of the dates on screen: the clinic's own format for the Russian UI, British (day first, 24 h) for English. */
const INTL_LOCALE: Readonly<Record<Locale, string>> = { ru: 'ru-BY', en: 'en-GB' };

type FormatKind = 'dateTime' | 'time' | 'date' | 'dayMedium' | 'dayLong' | 'dayHeading' | 'dayShort' | 'weekdayShort';

/** Instants are read in the clinic zone; a calendar day (a key) has no zone, so it is read as UTC noon and never moves. */
const FORMAT_OPTIONS: Readonly<Record<FormatKind, Intl.DateTimeFormatOptions>> = {
  dateTime: { timeZone: CLINIC_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' },
  time: { timeZone: CLINIC_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
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

/** The language currently selected in the UI: what a formatter uses when the caller does not name one. */
export function currentLocale(): Locale {
  return useUiStore.getState().locale;
}

function validDate(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function keyToNoon(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00Z`);
}

// ---------------------------------------------------------------------------------------------------------------------
// Calendar days (`YYYY-MM-DD` keys): arithmetic is done on the key itself in UTC, so it never drifts with a zone or DST.
// ---------------------------------------------------------------------------------------------------------------------

/** `true` for a real calendar day written as `YYYY-MM-DD` (`2026-02-30` is not one). */
export function isDateKey(value: string): boolean {
  if (!DATE_KEY_PATTERN.test(value)) return false;
  const parsed = keyToNoon(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/** Moves a `YYYY-MM-DD` key by whole days; text that is not a day is returned as it was. */
export function shiftDateKey(dateKey: string, days: number): string {
  if (!isDateKey(dateKey)) return dateKey;
  return new Date(keyToNoon(dateKey).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** `to - from` in whole days (negative when `to` is before `from`); `NaN` for an unreadable key. */
export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((keyToNoon(toKey).getTime() - keyToNoon(fromKey).getTime()) / DAY_MS);
}

let dayKeyFormatter: Intl.DateTimeFormat | null = null;

/** `en-CA` writes `YYYY-MM-DD`; built once because lists ask for the day of every row. */
function dayKeyParts(date: Date): Intl.DateTimeFormatPart[] {
  dayKeyFormatter ??= new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
  return dayKeyFormatter.formatToParts(date);
}

/** Calendar-day key of an instant in the clinic zone; today by default (`''` for an invalid date). The journal must not drift to UTC at midnight. */
export function clinicDateKey(date: Date = new Date()): string {
  if (Number.isNaN(date.getTime())) return '';
  const parts = dayKeyParts(date);
  const part = (type: string, fallback: string): string => parts.find((p) => p.type === type)?.value ?? fallback;
  return `${part('year', '0000')}-${part('month', '00')}-${part('day', '00')}`;
}

/** The clinic day (`YYYY-MM-DD`) an RFC 3339 instant falls on. */
export function clinicDayOf(iso: string): string {
  return clinicDateKey(new Date(iso));
}

/** `+03:00`-style UTC offset of the clinic zone on the given day. */
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
  /** RFC 3339 start of the clinic day (inclusive bound of `?from=`). */
  readonly from: string;
  /** RFC 3339 last second of the clinic day (inclusive bound of `?to=`). */
  readonly to: string;
}

/** Inclusive RFC 3339 bounds of a clinic day: a date-only filter would be read in the server's zone. */
export function clinicDayBounds(dateKey: string): DayBounds {
  const offset = clinicOffset(dateKey);
  return { from: `${dateKey}T00:00:00${offset}`, to: `${dateKey}T23:59:59${offset}` };
}

/** Whole years between a FHIR `birthDate` and `today`; `null` when the birth date is not a full `YYYY-MM-DD` (FHIR allows `YYYY`). */
export function ageInYears(birthDate: string, today: string = clinicDateKey()): number | null {
  if (!isDateKey(birthDate) || !isDateKey(today)) return null;
  const [birthYear, birthMonth, birthDay] = birthDate.split('-').map(Number) as [number, number, number];
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  const hadBirthday: boolean = month > birthMonth || (month === birthMonth && day >= birthDay);
  const age: number = year - birthYear - (hadBirthday ? 0 : 1);
  return age >= 0 ? age : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------------------------------------------------

/** `19 окт. 2026 г., 10:00` — the instant in the clinic zone. */
export function formatClinicDateTime(iso: string, locale: Locale = currentLocale()): string {
  const date = validDate(iso);
  return date === null ? iso : formatterFor('dateTime', locale).format(date);
}

/** `10:00` — the clock time of an instant in the clinic zone. */
export function formatClinicTime(iso: string, locale: Locale = currentLocale()): string {
  const date = validDate(iso);
  return date === null ? iso : formatterFor('time', locale).format(date);
}

export type DayStyle = 'numeric' | 'medium' | 'long';

/**
 * A calendar day kept as a `YYYY-MM-DD` key (a birth date, a period bound, a schedule horizon). It is not an instant, so it
 * must not move with a zone. `numeric` is `16.10.2026` for dense tables; `medium` is `16 окт. 2026 г.`; `long` spells the month.
 */
export function formatDateKey(dateKey: string, style: DayStyle = 'medium', locale: Locale = currentLocale()): string {
  if (!isDateKey(dateKey)) return dateKey;
  if (style === 'numeric') return dateKey.split('-').reverse().join('.');
  return formatterFor(style === 'long' ? 'dayLong' : 'dayMedium', locale).format(keyToNoon(dateKey));
}

/** The day of an instant in the clinic zone; a bare `YYYY-MM-DD` is shown as that day (long style). */
export function formatClinicDate(value: string, locale: Locale = currentLocale()): string {
  if (DATE_KEY_PATTERN.test(value)) return formatDateKey(value, 'long', locale);
  const date = validDate(value);
  return date === null ? value : formatterFor('date', locale).format(date);
}

/** `понедельник, 19 октября` for the heading of a day; `compact` is `пн, 19.10.2026` for dense grids. */
export function formatDayHeading(dateKey: string, locale: Locale = currentLocale(), style: 'long' | 'compact' = 'long'): string {
  if (!isDateKey(dateKey)) return dateKey;
  if (style === 'long') return formatterFor('dayHeading', locale).format(keyToNoon(dateKey));
  return `${formatterFor('weekdayShort', locale).format(keyToNoon(dateKey))}, ${formatDateKey(dateKey, 'numeric')}`;
}

/** `19 окт.` for a day: the ends of a period label. */
export function formatDayShort(dateKey: string, locale: Locale = currentLocale()): string {
  return isDateKey(dateKey) ? formatterFor('dayShort', locale).format(keyToNoon(dateKey)) : dateKey;
}

/** Replaces every instant inside a server sentence with the clinic-zone date and time, leaving the rest of the text alone. */
export function localizeInstants(text: string, locale: Locale = currentLocale()): string {
  return text.replace(EMBEDDED_INSTANT, (instant) => formatClinicDateTime(instant, locale));
}

// ---------------------------------------------------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------------------------------------------------

export interface SlotDay<TSlot> {
  readonly day: string;
  readonly slots: ReadonlyArray<TSlot>;
}

/** Slots grouped by clinic day; days and the slots inside them ascend. Every instant is parsed once. */
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
