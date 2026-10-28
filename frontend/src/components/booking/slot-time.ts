/**
 * slot-time — the rules of the slot picker's window. Slots are RFC 3339 UTC instants; the clinic lives in `Europe/Minsk`,
 * so the picker works in clinic days (`lib/clinic-time` does the calendar and the formatting).
 */
import type { Slot } from '@/components/catalog/catalog-types';
import { clinicHourOf, isDateKey, shiftDateKey } from '@/lib/clinic-time';

const MINUTE_MS = 60 * 1000;

/** One page of the picker: two weeks, both ends inclusive (the API accepts up to 31 days per request). */
export const SLOT_WINDOW_DAYS = 14;

/**
 * How far ahead the picker may look: the day the "jump to date" field stops at. The API refuses a `from` more than
 * 366 days ahead (400 VALIDATION_ERROR), and schedules are planned for 90 days, so a year is a generous ceiling.
 */
export const MAX_LOOKAHEAD_DAYS = 365;

export interface SlotWindow {
  readonly from: string;
  readonly to: string;
}

export function slotWindow(from: string, days: number = SLOT_WINDOW_DAYS): SlotWindow {
  return { from, to: shiftDateKey(from, days - 1) };
}

/** Every clinic day of the window, both ends included: what the day strip lists, free time or not. */
export function windowDays(window: SlotWindow): ReadonlyArray<string> {
  const days: string[] = [];
  for (let day: string = window.from; day <= window.to && days.length < 366; day = shiftDateKey(day, 1)) days.push(day);
  return days;
}

/** A first day for the picker: the requested one, but never before today and never garbage. */
export function clampToToday(day: string | undefined, today: string): string {
  return day !== undefined && isDateKey(day) && day > today ? day : today;
}

/** `clampToToday`, and never beyond the last day the API accepts as the start of a search (`MAX_LOOKAHEAD_DAYS`). */
export function clampToHorizon(day: string | undefined, today: string): string {
  const last: string = shiftDateKey(today, MAX_LOOKAHEAD_DAYS);
  const first: string = clampToToday(day, today);
  return first > last ? last : first;
}

export function slotDurationMin(slot: Pick<Slot, 'start' | 'end'>): number {
  const length: number = Date.parse(slot.end) - Date.parse(slot.start);
  return Number.isFinite(length) && length > 0 ? Math.round(length / MINUTE_MS) : 0;
}

/** Parts of the clinic's day the slot grid groups by (message keys `booking.part.<part>`). */
export type DayPart = 'morning' | 'day' | 'evening';

export const DAY_PARTS: ReadonlyArray<DayPart> = ['morning', 'day', 'evening'];

const NOON_HOUR = 12;
const EVENING_HOUR = 17;

/** Morning is before 12:00, the day runs to 17:00, the evening starts at 17:00 (clinic wall clock). */
export function dayPartOf(startIso: string): DayPart {
  const hour: number = clinicHourOf(startIso);
  if (hour < NOON_HOUR) return 'morning';
  return hour < EVENING_HOUR ? 'day' : 'evening';
}
