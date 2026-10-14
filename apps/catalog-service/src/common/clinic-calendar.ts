/**
 * The clinic works in Minsk time. Belarus has been on UTC+3 all year since
 * 2011 (no daylight saving), so a fixed offset is exact for every schedule the
 * clinic can plan, and it keeps window generation (`09:00` -> an instant)
 * independent of the ICU build. `slots/clinic-time.ts` renders labels with
 * `Intl` in the same zone; `clinic-calendar.spec.ts` pins the two together.
 */
export const CLINIC_TIME_ZONE = 'Europe/Minsk';

const CLINIC_UTC_OFFSET = '+03:00';
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const CLINIC_OFFSET_MS = 3 * 60 * MINUTE_MS;

export type DayCode = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

/** Index = `Date#getUTCDay()` (Sunday is 0). */
const DAY_CODES: readonly DayCode[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** `YYYY-MM-DD` of the clinic calendar day an instant falls on. */
export function clinicDateOf(epochMs: number): string {
  return new Date(epochMs + CLINIC_OFFSET_MS).toISOString().slice(0, 10);
}

/** First instant of a clinic calendar day (`YYYY-MM-DD`). */
export function clinicDayStartMs(date: string): number {
  return Date.parse(`${date}T00:00:00${CLINIC_UTC_OFFSET}`);
}

/** Last instant (millisecond) of a clinic calendar day. */
export function clinicDayEndMs(date: string): number {
  return clinicDayStartMs(date) + DAY_MS - 1;
}

/** The instant `minuteOfDay` minutes after midnight on a clinic calendar day. */
export function clinicInstantMs(date: string, minuteOfDay: number): number {
  return clinicDayStartMs(date) + minuteOfDay * MINUTE_MS;
}

/** Weekly-window code (`MO`..`SU`) of a clinic calendar day. */
export function clinicDayCode(date: string): DayCode {
  return DAY_CODES[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? 'MO';
}

/**
 * Every clinic calendar day from the day of `fromMs` to the day of `toMs`,
 * inclusive. Empty when `toMs` falls on an earlier day than `fromMs`.
 */
export function clinicDaysBetween(fromMs: number, toMs: number): string[] {
  const firstDayMs = Date.parse(`${clinicDateOf(fromMs)}T00:00:00Z`);
  const lastDayMs = Date.parse(`${clinicDateOf(toMs)}T00:00:00Z`);
  const days: string[] = [];
  for (let dayMs = firstDayMs; dayMs <= lastDayMs; dayMs += DAY_MS) {
    days.push(new Date(dayMs).toISOString().slice(0, 10));
  }
  return days;
}

/** The calendar day `days` after (or before, when negative) a clinic date. */
export function addClinicDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}
