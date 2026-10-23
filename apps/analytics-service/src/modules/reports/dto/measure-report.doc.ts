import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { AppointmentsSummaryDto } from './appointments-summary.dto';
import type { EncountersSummaryDto } from './encounters-summary.dto';
import type { MeasureGroupDto, MeasurePeriodDto, MeasureReportDto } from './measure-report.dto';
import type { ServicesPopularityDto } from './services-popularity.dto';

export class MeasureGroupDoc implements MeasureGroupDto {
  @ApiProperty({ description: 'Appointment.status, specialty code or HealthcareService id', example: 'booked' })
  code!: string;

  @ApiPropertyOptional({ description: 'Code system of `code` (specialty groups only)' })
  system?: string;

  @ApiPropertyOptional()
  display?: string;

  @ApiProperty({ minimum: 0, example: 12 })
  count!: number;
}

export class MeasurePeriodDoc implements MeasurePeriodDto {
  @ApiProperty({ type: String, format: 'date-time', example: '2026-10-01T00:00:00.000Z' })
  start!: string;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-10-31T23:59:59.999Z' })
  end!: string;
}

/** Shared shape of the `MeasureReport`-derived responses (API §9.1-9.3). */
export class MeasureReportDoc implements MeasureReportDto {
  @ApiProperty({ example: 'appointments-by-status' })
  measure!: string;

  @ApiProperty({ enum: ['cohort'] })
  scoring!: 'cohort';

  @ApiProperty({ type: MeasurePeriodDoc })
  period!: MeasurePeriodDoc;

  @ApiProperty({ description: 'Sum of the groups', minimum: 0 })
  total!: number;

  @ApiProperty({ type: [MeasureGroupDoc] })
  groups!: MeasureGroupDoc[];
}

/** Swagger description of `AppointmentsSummaryDto` (API §9.1). */
export class AppointmentsSummaryDoc extends MeasureReportDoc implements AppointmentsSummaryDto {
  @ApiProperty({ enum: ['appointments-by-status'] })
  declare measure: 'appointments-by-status';

  @ApiProperty({ minimum: 0 })
  booked!: number;

  @ApiProperty({ minimum: 0, description: 'Attended visits (Appointment.status fulfilled)' })
  fulfilled!: number;

  @ApiProperty({ minimum: 0 })
  cancelled!: number;

  @ApiProperty({ minimum: 0 })
  noshow!: number;
}

/** Swagger description of `EncountersSummaryDto` (API §9.2). */
export class EncountersSummaryDoc extends MeasureReportDoc implements EncountersSummaryDto {
  @ApiProperty({ enum: ['encounters-by-specialty'] })
  declare measure: 'encounters-by-specialty';
}

/** Swagger description of `ServicesPopularityDto` (API §9.3). */
export class ServicesPopularityDoc extends MeasureReportDoc implements ServicesPopularityDto {
  @ApiProperty({ enum: ['services-popularity'] })
  declare measure: 'services-popularity';
}
