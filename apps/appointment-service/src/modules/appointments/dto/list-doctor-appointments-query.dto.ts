import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsISO8601, IsOptional, Matches } from 'class-validator';
import { FHIR_ID_PATTERN } from '@medcenter/common';

import { APPOINTMENT_STATUSES, toStatusList, type AppointmentStatus } from './list-appointments-query.dto';
import { PageQueryDto } from './page-query.dto';

/** `@IsISO8601` alone lets week/ordinal dates through, which HAPI rejects (500 instead of 400). */
const RFC3339_DATE_OR_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/;

const RFC3339_MESSAGE =
  '$property must be an RFC 3339 date (YYYY-MM-DD) or date-time with a time zone';

export class ListDoctorAppointmentsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    description:
      'Inclusive lower bound of start: RFC 3339 date-time, or a date for the start of that clinic day (Europe/Minsk)',
    example: '2026-11-02',
  })
  @IsOptional()
  @Matches(RFC3339_DATE_OR_DATE_TIME, { message: RFC3339_MESSAGE })
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({
    description:
      'Inclusive upper bound of start: RFC 3339 date-time, or a date for the end of that clinic day (Europe/Minsk)',
    example: '2026-11-09',
  })
  @IsOptional()
  @Matches(RFC3339_DATE_OR_DATE_TIME, { message: RFC3339_MESSAGE })
  @IsISO8601({ strict: true })
  to?: string;

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

  @ApiPropertyOptional({
    description: 'Patient id: only the appointments of this patient (the doctor compartment still applies)',
    pattern: FHIR_ID_PATTERN.source,
    example: '9f2c',
  })
  @IsOptional()
  @Matches(FHIR_ID_PATTERN, { message: '$property must be a FHIR resource id ([A-Za-z0-9-.]{1,64})' })
  patient?: string;
}
