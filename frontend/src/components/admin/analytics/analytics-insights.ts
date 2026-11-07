import { sharePercent, splitGroups, statusCounts } from './analytics-math';
import type { AppointmentsReport, MeasureReport } from './analytics-types';

export type CancellationComparison = 'overOthers' | 'overEach' | 'other';

export interface CancellationInsight {
  readonly count: number;
  readonly total: number;
  readonly percent: number;
  readonly booked: number;
  readonly noshow: number;
  readonly comparison: CancellationComparison;
}

export function cancellationInsight(report: AppointmentsReport): CancellationInsight | null {
  const { booked, fulfilled, cancelled, noshow } = statusCounts(report);
  if (report.total <= 0 || cancelled <= 0) return null;
  const comparison: CancellationComparison =
    cancelled > booked + fulfilled + noshow ? 'overOthers' : cancelled > booked && cancelled > fulfilled && cancelled > noshow ? 'overEach' : 'other';
  return { count: cancelled, total: report.total, percent: sharePercent(cancelled, report.total), booked, noshow, comparison };
}

export interface NoshowInsight {
  readonly count: number;
  readonly percent: number;
}

export function noshowInsight(report: AppointmentsReport): NoshowInsight | null {
  const { noshow } = statusCounts(report);
  if (report.total <= 0 || noshow <= 0) return null;
  return { count: noshow, percent: sharePercent(noshow, report.total) };
}

export interface SpecialtyInsight {
  readonly name: string;
  readonly count: number;
  readonly total: number;
  readonly percent: number;
  readonly only: boolean;
}

export function specialtyInsight(report: MeasureReport): SpecialtyInsight | null {
  const { named } = splitGroups(report.groups);
  const leader = named[0];
  if (report.total <= 0 || leader === undefined || leader.display === undefined) return null;
  return { name: leader.display, count: leader.count, total: report.total, percent: sharePercent(leader.count, report.total), only: named.length === 1 };
}
