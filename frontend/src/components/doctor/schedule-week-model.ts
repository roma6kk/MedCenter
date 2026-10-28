/**
 * schedule-week-model — pure shaping of the doctor's week calendar (A10): the slots of the week, the visits that fill some
 * of them, and the load of each day. The views pass in what the API returned, so every rule is testable on plain objects.
 */
import { clinicDayOf, shiftDateKey } from '@/lib/clinic-time';
import { weekdayIndex } from '@/lib/calendar-grid';
import type { JournalAppointment, ScheduleSlot } from './doctor-types';
import { clinicMinutes } from './journal-model';

export const WEEK_LENGTH = 7;

/** The Monday of the week that holds `dateKey`. */
export function weekStartOf(dateKey: string): string {
  return shiftDateKey(dateKey, -weekdayIndex(dateKey));
}

/** The seven days (Monday first) of the week that starts at `weekStart`. */
export function weekDaysOf(weekStart: string): ReadonlyArray<string> {
  return Array.from({ length: WEEK_LENGTH }, (_, index) => shiftDateKey(weekStart, index));
}

/** A slot with the visit that took it, when the journal knows one. `visit` is absent for a free slot and for a busy one the journal does not list. */
export interface CalendarCell {
  readonly slot: ScheduleSlot;
  readonly visit?: JournalAppointment;
  /** Minutes since midnight of the slot start, clinic zone. */
  readonly minutes: number;
}

export interface DayLoad {
  readonly dateKey: string;
  readonly cells: ReadonlyArray<CalendarCell>;
  readonly busy: number;
  readonly total: number;
}

export interface WeekCalendar {
  readonly days: ReadonlyArray<DayLoad>;
  /** The distinct start times of the week, ascending: the rows of the grid. */
  readonly rows: ReadonlyArray<number>;
}

/** A cancelled visit gave its slot back: it must not be shown on it, whatever the journal still says. */
function isLive(visit: JournalAppointment): boolean {
  return visit.status !== 'cancelled';
}

/**
 * Groups the slots by day and attaches the visits (by `slotId`). A slot the service marks as entered in error is not a
 * slot of the doctor's day. `busy` counts the busy slots, `total` the slots that can be shown.
 */
export function buildWeekCalendar(days: ReadonlyArray<string>, slots: ReadonlyArray<ScheduleSlot>, visits: ReadonlyArray<JournalAppointment>): WeekCalendar {
  const visitBySlot = new Map<string, JournalAppointment>();
  for (const visit of visits) if (isLive(visit)) visitBySlot.set(visit.slotId, visit);
  const byDay = new Map<string, CalendarCell[]>(days.map((day) => [day, []]));
  for (const slot of slots) {
    if (slot.status === 'entered-in-error') continue;
    const bucket: CalendarCell[] | undefined = byDay.get(clinicDayOf(slot.start));
    if (bucket === undefined) continue;
    const visit: JournalAppointment | undefined = slot.status === 'busy' ? visitBySlot.get(slot.id) : undefined;
    bucket.push({ slot, minutes: clinicMinutes(slot.start), ...(visit === undefined ? {} : { visit }) });
  }
  const loads: ReadonlyArray<DayLoad> = days.map((dateKey) => {
    const cells: ReadonlyArray<CalendarCell> = [...(byDay.get(dateKey) ?? [])].sort((a, b) => a.minutes - b.minutes);
    return { dateKey, cells, busy: cells.filter((cell) => cell.slot.status === 'busy').length, total: cells.length };
  });
  const rows: ReadonlyArray<number> = [...new Set(loads.flatMap((day) => day.cells.map((cell) => cell.minutes)))].sort((a, b) => a - b);
  return { days: loads, rows };
}

/** `9:05` → `09:05`: the label of a grid row. */
export function minutesLabel(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Share of the day's slots that are taken, 0–100 (0 for a day without slots). */
export function loadPercent(day: Pick<DayLoad, 'busy' | 'total'>): number {
  return day.total === 0 ? 0 : Math.round((day.busy / day.total) * 100);
}
