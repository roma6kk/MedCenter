import type { MeasureReportDto } from './measure-report.dto';

export interface AppointmentsSummaryDto extends MeasureReportDto {
  readonly measure: 'appointments-by-status';
  readonly booked: number;
  readonly fulfilled: number;
  readonly cancelled: number;
  readonly noshow: number;
}
