/**
 * schedule-week-plan-model — the admin's «Неделя» view of the schedule list: for each doctor (or each room) the working
 * windows of every weekday in one row. It is the weekly plan, not the load: the windows are in the list answer, while the
 * slots (what is booked) are read one schedule at a time and only a page of them.
 */
import { WEEK_DAYS, type AdminSchedule, type WeekDay } from './schedule-types';

export type PlanGrouping = 'doctor' | 'room';

export interface PlanEntry {
  /** `09:00–13:00`. */
  readonly times: string;
  /** The other side of the row: the room for a doctor's row, the doctor for a room's row. */
  readonly where: string;
}

export interface PlanRow {
  /** The doctor's or the room's id (`''` for a schedule that has none). */
  readonly key: string;
  readonly label: string;
  readonly days: Readonly<Record<WeekDay, ReadonlyArray<PlanEntry>>>;
}

interface Names {
  readonly doctor: (id: string | undefined) => string;
  readonly room: (id: string | undefined) => string;
}

function emptyDays(): Record<WeekDay, PlanEntry[]> {
  return { MO: [], TU: [], WE: [], TH: [], FR: [], SA: [], SU: [] };
}

/** One row per doctor or per room, alphabetical; every window of every schedule lands on its weekday, earliest first, twins once. */
export function buildWeekPlan(schedules: ReadonlyArray<AdminSchedule>, grouping: PlanGrouping, names: Names): ReadonlyArray<PlanRow> {
  const rows = new Map<string, { label: string; days: Record<WeekDay, PlanEntry[]> }>();
  for (const schedule of schedules) {
    const ownId: string = (grouping === 'doctor' ? schedule.practitionerRoleId : schedule.roomId) ?? '';
    const row = rows.get(ownId) ?? { label: grouping === 'doctor' ? names.doctor(schedule.practitionerRoleId) : names.room(schedule.roomId), days: emptyDays() };
    rows.set(ownId, row);
    const where: string = grouping === 'doctor' ? names.room(schedule.roomId) : names.doctor(schedule.practitionerRoleId);
    for (const window of schedule.windows) {
      const entry: PlanEntry = { times: `${window.startTime}–${window.endTime}`, where };
      const day: PlanEntry[] = row.days[window.dayOfWeek];
      if (!day.some((known) => known.times === entry.times && known.where === entry.where)) day.push(entry);
    }
  }
  return [...rows.entries()]
    .map(([key, row]): PlanRow => {
      const days = emptyDays();
      for (const day of WEEK_DAYS) days[day] = [...row.days[day]].sort((a, b) => a.times.localeCompare(b.times));
      return { key, label: row.label, days };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
}
