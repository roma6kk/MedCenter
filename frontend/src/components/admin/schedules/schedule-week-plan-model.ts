import { WEEK_DAYS, type AdminSchedule, type WeekDay } from './schedule-types';

export type PlanGrouping = 'doctor' | 'room';

interface PlanEntry {
  readonly times: string;
  readonly where: string;
}

export interface PlanRow {
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
