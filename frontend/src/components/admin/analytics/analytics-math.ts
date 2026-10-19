import { APPOINTMENT_STATUSES, type AppointmentStatusCode, type AppointmentsReport, type MeasureGroup } from './analytics-types';

/** Whole-number share of `count` in `total` (0 when there is nothing to divide). */
export function sharePercent(count: number, total: number): number {
  if (total <= 0 || count <= 0) return 0;
  return Math.min(100, Math.round((count * 100) / total));
}

/** The count of one appointment status: from `groups`, else from the flat counter, else 0. */
export function statusCount(report: AppointmentsReport, status: AppointmentStatusCode): number {
  return report.groups.find((group) => group.code === status)?.count ?? report[status] ?? 0;
}

export function statusCounts(report: AppointmentsReport): Readonly<Record<AppointmentStatusCode, number>> {
  const entries = APPOINTMENT_STATUSES.map((status) => [status, statusCount(report, status)] as const);
  return Object.fromEntries(entries) as Record<AppointmentStatusCode, number>;
}

/** Largest first, ties by name: the order a «top» list reads in, whatever the server sent. */
export function rankGroups(groups: ReadonlyArray<MeasureGroup>): ReadonlyArray<MeasureGroup> {
  return [...groups].sort((a, b) => b.count - a.count || (a.display ?? a.code).localeCompare(b.display ?? b.code));
}
