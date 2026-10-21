import { sharePercent, splitGroups, statusCounts } from './analytics-math';
import type { AppointmentsReport, MeasureReport } from './analytics-types';

/** Which sentence states the main finding of the appointments report (the page `h1`). `none`: no appointments, no finding. */
export type HeadlineKey = 'cancelledMajority' | 'cancelledTop' | 'noshowTop' | 'bookedTop' | 'balanced' | 'none';

export function headlineOf(report: AppointmentsReport): HeadlineKey {
  const { booked, cancelled, noshow } = statusCounts(report);
  const top = Math.max(booked, cancelled, noshow);
  if (report.total <= 0 || top <= 0) return 'none';
  const leaders = [booked, cancelled, noshow].filter((count) => count === top).length;
  if (leaders > 1) return 'balanced';
  if (cancelled === top) return cancelled * 2 > report.total ? 'cancelledMajority' : 'cancelledTop';
  return noshow === top ? 'noshowTop' : 'bookedTop';
}

/** How the cancellations compare with the other two statuses. */
export type CancellationComparison = 'overOthers' | 'overEach' | 'other';

export interface CancellationInsight {
  readonly count: number;
  readonly total: number;
  readonly percent: number;
  readonly booked: number;
  readonly noshow: number;
  readonly comparison: CancellationComparison;
}

/** `null` when nothing was cancelled: a card about zero cancellations would say nothing. */
export function cancellationInsight(report: AppointmentsReport): CancellationInsight | null {
  const { booked, cancelled, noshow } = statusCounts(report);
  if (report.total <= 0 || cancelled <= 0) return null;
  const comparison: CancellationComparison = cancelled > booked + noshow ? 'overOthers' : cancelled > booked && cancelled > noshow ? 'overEach' : 'other';
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
  /** `true` when it is the only named specialty with encounters. */
  readonly only: boolean;
}

/** The leading specialty among the completed encounters; `null` without encounters or when none of the groups has a name. */
export function specialtyInsight(report: MeasureReport): SpecialtyInsight | null {
  const { named } = splitGroups(report.groups);
  const leader = named[0];
  if (report.total <= 0 || leader === undefined || leader.display === undefined) return null;
  return { name: leader.display, count: leader.count, total: report.total, percent: sharePercent(leader.count, report.total), only: named.length === 1 };
}
