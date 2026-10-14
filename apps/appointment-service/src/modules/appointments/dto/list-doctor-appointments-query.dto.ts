import { IsISO8601, IsOptional, Matches } from 'class-validator';

import { PageQueryDto } from './page-query.dto';

/**
 * RFC 3339 `full-date` or `date-time` with a zone (API §0), the forms FHIR
 * `date` search understands. `@IsISO8601` alone also lets week (`2026-W45`) and
 * ordinal (`2026-306`) dates through, which HAPI rejects — a client typo would
 * then surface as a 500 instead of a 400.
 */
const RFC3339_DATE_OR_DATE_TIME = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/;

const RFC3339_MESSAGE = '$property must be an RFC 3339 date (YYYY-MM-DD) or date-time with a time zone';

/**
 * API §6.5 `GET /doctor/appointments?from=&to=&page=&pageSize=&sortOrder=`.
 * Both bounds are inclusive and filter `Appointment.start`; a date-only value
 * covers the whole day (FHIR `date` search precision).
 */
export class ListDoctorAppointmentsQueryDto extends PageQueryDto {
  @IsOptional()
  @Matches(RFC3339_DATE_OR_DATE_TIME, { message: RFC3339_MESSAGE })
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @Matches(RFC3339_DATE_OR_DATE_TIME, { message: RFC3339_MESSAGE })
  @IsISO8601({ strict: true })
  to?: string;
}
