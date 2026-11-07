import { APPOINTMENT_STATUSES, type AppointmentStatusCode, type AppointmentsReport, type MeasureGroup } from './analytics-types';

export function sharePercent(count: number, total: number): number {
  if (total <= 0 || count <= 0) return 0;
  return Math.min(100, Math.round((count * 100) / total));
}

export function statusCount(report: AppointmentsReport, status: AppointmentStatusCode): number {
  return report.groups.find((group) => group.code === status)?.count ?? report[status] ?? 0;
}

export function statusCounts(report: AppointmentsReport): Readonly<Record<AppointmentStatusCode, number>> {
  const entries = APPOINTMENT_STATUSES.map((status) => [status, statusCount(report, status)] as const);
  return Object.fromEntries(entries) as Record<AppointmentStatusCode, number>;
}

export function rankGroups(groups: ReadonlyArray<MeasureGroup>): ReadonlyArray<MeasureGroup> {
  return [...groups].sort((a, b) => b.count - a.count || (a.display ?? a.code).localeCompare(b.display ?? b.code));
}

export interface SplitGroups {
  readonly named: ReadonlyArray<MeasureGroup>;
  readonly unnamed: ReadonlyArray<MeasureGroup>;
}

export function splitGroups(groups: ReadonlyArray<MeasureGroup>): SplitGroups {
  return {
    named: rankGroups(groups.filter((group) => group.display !== undefined)),
    unnamed: groups.filter((group) => group.display === undefined),
  };
}
