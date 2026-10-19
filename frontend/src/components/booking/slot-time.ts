/**
 * slot-time — calendar helpers of the slot picker. Slots are RFC 3339 UTC instants; the clinic lives in
 * `Europe/Minsk`, so a patient sees (and groups by) Minsk wall-clock time, never UTC (frontend-design-spec §7).
 */
import type { Slot } from '@/components/catalog/catalog-types';
import type { Locale } from '@/lib/i18n/locale';
import { minskDateKey } from '@/lib/utils';

const CLINIC_TIME_ZONE = 'Europe/Minsk';
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** One page of the picker: two weeks, both ends inclusive (the API accepts up to 31 days per request). */
export const SLOT_WINDOW_DAYS = 14;

/**
 * How far ahead the picker may look: the day the "jump to date" field stops at. The API refuses a `from` more than
 * 366 days ahead (400 VALIDATION_ERROR), and schedules are planned for 90 days, so a year is a generous ceiling.
 */
export const MAX_LOOKAHEAD_DAYS = 365;

const LOCALE_TAG: Readonly<Record<Locale, string>> = { ru: 'ru-BY', en: 'en-GB' };

type FormatterKind = 'time' | 'heading' | 'short' | 'dateTime';

const FORMAT_OPTIONS: Readonly<Record<FormatterKind, Intl.DateTimeFormatOptions>> = {
  time: { timeZone: CLINIC_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
  heading: { timeZone: CLINIC_TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long' },
  short: { timeZone: CLINIC_TIME_ZONE, day: 'numeric', month: 'short' },
  dateTime: { timeZone: CLINIC_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' },
};

const formatters = new Map<string, Intl.DateTimeFormat>();

/**
 * One `Intl.DateTimeFormat` per kind and locale for the whole session. A slot list formats a time per tile and a heading
 * per day, and building a formatter costs ~0.1 ms: per call that made every click on a slot re-render for ~70 ms.
 */
function formatterFor(kind: FormatterKind, locale: Locale): Intl.DateTimeFormat {
  const key = `${kind}:${locale}`;
  const cached: Intl.DateTimeFormat | undefined = formatters.get(key);
  if (cached !== undefined) return cached;
  const created = new Intl.DateTimeFormat(LOCALE_TAG[locale], FORMAT_OPTIONS[kind]);
  formatters.set(key, created);
  return created;
}

export interface SlotWindow {
  readonly from: string;
  readonly to: string;
}

export interface SlotDay {
  readonly day: string;
  readonly slots: ReadonlyArray<Slot>;
}

/** `YYYY-MM-DD` moved by whole calendar days (UTC arithmetic: a bare date has no zone, so no DST drift). */
export function shiftDay(day: string, days: number): string {
  const moved = new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS);
  return moved.toISOString().slice(0, 10);
}

export function slotWindow(from: string, days: number = SLOT_WINDOW_DAYS): SlotWindow {
  return { from, to: shiftDay(from, days - 1) };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** `true` for a real calendar day written as `YYYY-MM-DD` (`2026-02-30` is not one). */
export function isIsoDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const parsed: number = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

/** A first day for the picker: the requested one, but never before today and never garbage. */
export function clampToToday(day: string | undefined, today: string): string {
  return day !== undefined && isIsoDay(day) && day > today ? day : today;
}

/** `clampToToday`, and never beyond the last day the API accepts as the start of a search (`MAX_LOOKAHEAD_DAYS`). */
export function clampToHorizon(day: string | undefined, today: string): string {
  const last: string = shiftDay(today, MAX_LOOKAHEAD_DAYS);
  const first: string = clampToToday(day, today);
  return first > last ? last : first;
}

/** Today in the clinic calendar. */
export function todayInClinic(now: Date = new Date()): string {
  return minskDateKey(now);
}

/** Clinic calendar day (`YYYY-MM-DD`) of an instant. */
export function minskDayOf(iso: string): string {
  return minskDateKey(new Date(iso));
}

export function formatSlotTime(iso: string, locale: Locale): string {
  return formatterFor('time', locale).format(new Date(iso));
}

/** "понедельник, 19 октября" for a clinic calendar day. */
export function formatDayHeading(day: string, locale: Locale): string {
  // Noon UTC is the same calendar day in Minsk (UTC+3), whatever the season.
  return formatterFor('heading', locale).format(new Date(`${day}T12:00:00.000Z`));
}

/** "19 окт." for a clinic calendar day: the ends of the period label. */
export function formatDayShort(day: string, locale: Locale): string {
  return formatterFor('short', locale).format(new Date(`${day}T12:00:00.000Z`));
}

/** Date and time of a slot for summaries: "19 окт. 2026 г., 14:00". */
export function formatSlotDateTime(iso: string, locale: Locale): string {
  return formatterFor('dateTime', locale).format(new Date(iso));
}

export function slotDurationMin(slot: Pick<Slot, 'start' | 'end'>): number {
  const length: number = Date.parse(slot.end) - Date.parse(slot.start);
  return Number.isFinite(length) && length > 0 ? Math.round(length / MINUTE_MS) : 0;
}

/** Slots grouped by clinic day; days and the slots inside them ascend. Every instant is parsed once. */
export function groupSlotsByDay(slots: ReadonlyArray<Slot>): ReadonlyArray<SlotDay> {
  const byDay = new Map<string, Slot[]>();
  slots
    .map((slot) => ({ slot, startMs: Date.parse(slot.start) }))
    .sort((a, b) => a.startMs - b.startMs)
    .forEach(({ slot, startMs }) => {
      const day: string = minskDateKey(new Date(startMs));
      const bucket: Slot[] | undefined = byDay.get(day);
      if (bucket === undefined) byDay.set(day, [slot]);
      else bucket.push(slot);
    });
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, daySlots]) => ({ day, slots: daySlots }));
}
