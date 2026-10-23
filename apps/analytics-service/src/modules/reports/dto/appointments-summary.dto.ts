import type { MeasureReportDto } from './measure-report.dto';

/**
 * API §9.1 — appointments whose start lies in the period, partitioned by their
 * current `Appointment.status`: `booked` (still ahead), `fulfilled` (attended),
 * `cancelled`, `noshow`. The population is the appointments the analytics
 * read-model has seen (it is filled from the moment the worker runs), so the
 * four counts always add up; the flat `booked`/`fulfilled`/`cancelled`/`noshow` fields
 * repeat the groups for the admin dashboard (`analytics-dashboard.tsx`).
 */
export interface AppointmentsSummaryDto extends MeasureReportDto {
  readonly measure: 'appointments-by-status';
  readonly booked: number;
  readonly fulfilled: number;
  readonly cancelled: number;
  readonly noshow: number;
}
