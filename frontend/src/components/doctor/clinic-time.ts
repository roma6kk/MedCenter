/**
 * clinic-time — calendar-day and clock helpers in the clinic timezone (Europe/Minsk, no DST since 2011).
 *
 * The API stores RFC 3339 instants. A doctor thinks in clinic days, so every day boundary sent to the API and every
 * time shown on screen goes through this module — never through the browser's own zone.
 */
import { minskDateKey } from '@/lib/utils';
import { useUiStore } from '@/store/use-ui-store';

export const CLINIC_TIME_ZONE = 'Europe/Minsk';
const FALLBACK_OFFSET = '+03:00';
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** BCP 47 tag of the dates on screen: the clinic's own format for the Russian UI, British (day first, 24 h) for English. */
function dateLocale(): string {
  return useUiStore.getState().locale === 'en' ? 'en-GB' : 'ru-BY';
}

export function isDateKey(value: string): boolean {
  if (!DATE_KEY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/** `YYYY-MM-DD` of an instant, read in the clinic timezone. */
export function minskDayKeyOf(iso: string): string {
  return minskDateKey(new Date(iso));
}

/** Moves a `YYYY-MM-DD` key by whole days (calendar arithmetic, immune to the browser zone). */
export function shiftDateKey(dateKey: string, days: number): string {
  const shifted = new Date(new Date(`${dateKey}T12:00:00Z`).getTime() + days * DAY_MS);
  return shifted.toISOString().slice(0, 10);
}

/** `+03:00`-style UTC offset of the clinic zone on the given day. */
function clinicOffset(dateKey: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: CLINIC_TIME_ZONE, timeZoneName: 'longOffset' }).formatToParts(
      new Date(`${dateKey}T12:00:00Z`),
    );
    const name = parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
    const match = /GMT([+-]\d{2}:\d{2})/.exec(name);
    return match?.[1] ?? FALLBACK_OFFSET;
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
export function minskDayBounds(dateKey: string): DayBounds {
  const offset = clinicOffset(dateKey);
  return { from: `${dateKey}T00:00:00${offset}`, to: `${dateKey}T23:59:59${offset}` };
}

export function formatMinskTime(iso: string): string {
  return new Intl.DateTimeFormat(dateLocale(), { timeZone: CLINIC_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

export function formatMinskDate(iso: string): string {
  return new Intl.DateTimeFormat(dateLocale(), { timeZone: CLINIC_TIME_ZONE, dateStyle: 'medium' }).format(new Date(iso));
}

export function formatMinskDateTime(iso: string): string {
  return new Intl.DateTimeFormat(dateLocale(), { timeZone: CLINIC_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }).format(new Date(iso));
}

/** `20 окт. 2026 г.` for a calendar day kept as a `YYYY-MM-DD` key (a period bound, a schedule horizon). */
export function formatDateKey(dateKey: string, style: 'medium' | 'long' = 'medium'): string {
  if (!isDateKey(dateKey)) return dateKey;
  return new Intl.DateTimeFormat(dateLocale(), { timeZone: 'UTC', dateStyle: style }).format(new Date(`${dateKey}T12:00:00Z`));
}

/** `вторник, 20 октября` for the heading of a slot day. */
export function formatDayHeading(dateKey: string): string {
  return new Intl.DateTimeFormat(dateLocale(), { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${dateKey}T12:00:00Z`));
}

function dateParts(dateKey: string): readonly [number, number, number] {
  return [Number(dateKey.slice(0, 4)), Number(dateKey.slice(5, 7)), Number(dateKey.slice(8, 10))];
}

/** Whole years between a FHIR `birthDate` and `today`; `null` when the birth date is not a full `YYYY-MM-DD` (FHIR allows `YYYY`). */
export function ageInYears(birthDate: string, today: string = minskDateKey()): number | null {
  if (!isDateKey(birthDate) || !isDateKey(today)) return null;
  const [birthYear, birthMonth, birthDay] = dateParts(birthDate);
  const [year, month, day] = dateParts(today);
  const hadBirthday: boolean = month > birthMonth || (month === birthMonth && day >= birthDay);
  const age: number = year - birthYear - (hadBirthday ? 0 : 1);
  return age >= 0 ? age : null;
}
