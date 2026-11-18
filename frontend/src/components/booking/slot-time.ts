/** Slots are RFC 3339 UTC instants; the clinic lives in `Europe/Minsk`, so the picker works in clinic days. */
import type { Slot } from '@/components/catalog/catalog-types';
import { clinicHourOf, isDateKey, shiftDateKey } from '@/lib/clinic-time';

const MINUTE_MS = 60 * 1000;

export const SLOT_WINDOW_DAYS = 14;

export const MAX_LOOKAHEAD_DAYS = 365;

export interface SlotWindow {
  readonly from: string;
  readonly to: string;
}

export function slotWindow(from: string, days: number = SLOT_WINDOW_DAYS): SlotWindow {
  return { from, to: shiftDateKey(from, days - 1) };
}

export function windowDays(window: SlotWindow): ReadonlyArray<string> {
  const days: string[] = [];
  for (let day: string = window.from; day <= window.to && days.length < 366; day = shiftDateKey(day, 1)) days.push(day);
  return days;
}

export function clampToToday(day: string | undefined, today: string): string {
  return day !== undefined && isDateKey(day) && day > today ? day : today;
}

export function clampToHorizon(day: string | undefined, today: string): string {
  const last: string = shiftDateKey(today, MAX_LOOKAHEAD_DAYS);
  const first: string = clampToToday(day, today);
  return first > last ? last : first;
}

export function slotDurationMin(slot: Pick<Slot, 'start' | 'end'>): number {
  const length: number = Date.parse(slot.end) - Date.parse(slot.start);
  return Number.isFinite(length) && length > 0 ? Math.round(length / MINUTE_MS) : 0;
}

export type DayPart = 'morning' | 'day' | 'evening';

export const DAY_PARTS: ReadonlyArray<DayPart> = ['morning', 'day', 'evening'];

const NOON_HOUR = 12;
const EVENING_HOUR = 17;

export function dayPartOf(startIso: string): DayPart {
  const hour: number = clinicHourOf(startIso);
  if (hour < NOON_HOUR) return 'morning';
  return hour < EVENING_HOUR ? 'day' : 'evening';
}
