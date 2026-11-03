import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsISO8601, IsOptional, Matches } from 'class-validator';

import { FHIR_ID_PATTERN } from '../fhir-reference';
import { APPOINTMENT_STATUSES, toStatusList, type AppointmentStatus } from './list-appointments-query.dto';
import { PageQueryDto } from './page-query.dto';

/**
 * RFC 3339 `full-date` or `date-time` with a zone (API §0), the forms FHIR
 * `date` search understands. `@IsISO8601` alone also lets week (`2026-W45`) and
 * ordinal (`2026-306`) dates through, which HAPI rejects — a client typo would
 * then surface as a 500 instead of a 400.
 */
const RFC3339_DATE_OR_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/;

const RFC3339_MESSAGE =
  '$property must be an RFC 3339 date (YYYY-MM-DD) or date-time with a time zone';

/**
 * API §6.5 `GET /doctor/appointments?from=&to=&status=&patient=&page=&pageSize=&sortOrder=`.
 * Both bounds are inclusive and filter `Appointment.start`; a date-only value
 * covers the whole day (FHIR `date` search precision). `status` and `patient`
 * narrow the doctor's own list further; they never widen the compartment, which
 * comes from the token (ADR-013).
 */
export class ListDoctorAppointmentsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    description: 'Inclusive lower bound of start: RFC 3339 date or date-time',
    example: '2026-11-02',
  })
  @IsOptional()
  @Matches(RFC3339_DATE_OR_DATE_TIME, { message: RFC3339_MESSAGE })
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({
    description: 'Inclusive upper bound of start: RFC 3339 date or date-time',
    example: '2026-11-09',
  })
  @IsOptional()
  @Matches(RFC3339_DATE_OR_DATE_TIME, { message: RFC3339_MESSAGE })
  @IsISO8601({ strict: true })
  to?: string;

  /** Keeps appointments in any of these statuses (one value or a comma list); every status when absent. */
  @ApiPropertyOptional({
    type: String,
    isArray: true,
    enum: APPOINTMENT_STATUSES,
    enumName: 'AppointmentStatus',
    description: 'One status or a comma list (OR); repeated parameters are accepted too',
    example: 'booked',
  })
  @IsOptional()
  @Transform(toStatusList)
  @IsIn(APPOINTMENT_STATUSES, { each: true })
  status?: AppointmentStatus[];

  /** Keeps the appointments of one patient; ANDed with the doctor's own compartment, so no other patient's visit appears. */
  @ApiPropertyOptional({
    description: 'Patient id: only the appointments of this patient (the doctor compartment still applies)',
    pattern: FHIR_ID_PATTERN.source,
    example: '9f2c',
  })
  @IsOptional()
  @Matches(FHIR_ID_PATTERN, { message: '$property must be a FHIR resource id ([A-Za-z0-9-.]{1,64})' })
  patient?: string;
}
