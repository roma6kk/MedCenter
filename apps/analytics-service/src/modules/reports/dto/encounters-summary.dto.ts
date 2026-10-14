import type { MeasureReportDto } from './measure-report.dto';

/**
 * API §9.2 — encounters completed in the period, grouped by the specialty of
 * the treating practitioner (`PractitionerRole.specialty`, resolved when the
 * `encounter.completed.v1` event was ingested). Group code `unknown` collects
 * encounters whose specialty could not be resolved.
 */
export interface EncountersSummaryDto extends MeasureReportDto {
  readonly measure: 'encounters-by-specialty';
}
