import { clinicDayOf, shiftDateKey } from '@/lib/clinic-time';
import { weekdayIndex } from '@/lib/calendar-grid';
import type { JournalAppointment, ScheduleSlot } from './doctor-types';
import { clinicMinutes } from './journal-model';

export const WEEK_LENGTH = 7;

export function weekStartOf(dateKey: string): string {
  return shiftDateKey(dateKey, -weekdayIndex(dateKey));
}

export function weekDaysOf(weekStart: string): ReadonlyArray<string> {
  return Array.from({ length: WEEK_LENGTH }, (_, index) => shiftDateKey(weekStart, index));
}

export interface CalendarCell {
  readonly slot: ScheduleSlot;
  readonly visit?: JournalAppointment;
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
  readonly rows: ReadonlyArray<number>;
}

function isLive(visit: JournalAppointment): boolean {
  return visit.status !== 'cancelled';
}

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

export function minutesLabel(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function loadPercent(day: Pick<DayLoad, 'busy' | 'total'>): number {
  return day.total === 0 ? 0 : Math.round((day.busy / day.total) * 100);
}
