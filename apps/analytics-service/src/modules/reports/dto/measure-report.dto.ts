export interface MeasureGroupDto {
  readonly code: string;
  readonly system?: string;
  readonly display?: string;
  readonly count: number;
}

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
