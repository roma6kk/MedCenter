import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, Matches } from 'class-validator';

import { RFC3339_DATE_OR_DATE_TIME } from './date-range';

const BOUND_MESSAGE = 'must be an RFC 3339 date (YYYY-MM-DD) or date-time';

export class DateRangeQueryDto {
  @ApiPropertyOptional({ description: 'Period start, RFC 3339 date (clinic day, Europe/Minsk) or date-time; default: 30 days before `to`', example: '2026-10-01' })
  @IsOptional()
  @Matches(RFC3339_DATE_OR_DATE_TIME, { message: `from ${BOUND_MESSAGE}` })
  @IsISO8601({ strict: true })
  readonly from?: string;

  @ApiPropertyOptional({ description: 'Period end, RFC 3339 date (clinic day, Europe/Minsk) or date-time; default: end of today. `from` <= `to`, at most 366 days', example: '2026-10-31' })
  @IsOptional()
  @Matches(RFC3339_DATE_OR_DATE_TIME, { message: `to ${BOUND_MESSAGE}` })
  @IsISO8601({ strict: true })
  readonly to?: string;
}
