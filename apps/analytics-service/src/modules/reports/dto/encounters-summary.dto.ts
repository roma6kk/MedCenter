import type { MeasureReportDto } from './measure-report.dto';

export interface EncountersSummaryDto extends MeasureReportDto {
  readonly measure: 'encounters-by-specialty';
}
