/**
 * `MeasureReport`-derived response shape shared by API §9.1–9.3. Every report
 * is a cohort count: each subject (appointment, encounter, booking) is counted
 * in exactly one group, and `total` is the sum of the groups.
 */
export interface MeasureGroupDto {
  /** Group code: the Appointment.status, the specialty code or the HealthcareService id. */
  readonly code: string;
  /** Code system of `code` (specialty groups only, when the coding carried one); the same code in two systems is two groups. */
  readonly system?: string;
  readonly display?: string;
  readonly count: number;
}

/** Inclusive period, as `MeasureReport.period` (ISO 8601 instants, UTC). */
export interface MeasurePeriodDto {
  readonly start: string;
  readonly end: string;
}

export interface MeasureReportDto {
  readonly measure: string;
  readonly scoring: 'cohort';
  readonly period: MeasurePeriodDto;
  readonly total: number;
  readonly groups: ReadonlyArray<MeasureGroupDto>;
}
