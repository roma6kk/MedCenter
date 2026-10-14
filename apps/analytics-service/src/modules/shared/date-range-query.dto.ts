import { IsISO8601, IsOptional, Matches } from 'class-validator';

import { RFC3339_DATE_OR_DATE_TIME } from './date-range';

const BOUND_MESSAGE = 'must be an RFC 3339 date (YYYY-MM-DD) or date-time';

/**
 * `?from=&to=` of API §9.1–9.4 (RFC 3339, UTC). Both bounds are optional: the
 * service defaults to the last 30 days and enforces `from <= to` and the
 * 366-day cap itself (see `resolveDateRange`), because class-validator cannot
 * compare two fields. `@Matches` refuses reduced precision (`2026-10`);
 * `@IsISO8601({ strict })` refuses impossible calendar dates (`2026-02-30`).
 */
export class DateRangeQueryDto {
  @IsOptional()
  @Matches(RFC3339_DATE_OR_DATE_TIME, { message: `from ${BOUND_MESSAGE}` })
  @IsISO8601({ strict: true })
  readonly from?: string;

  @IsOptional()
  @Matches(RFC3339_DATE_OR_DATE_TIME, { message: `to ${BOUND_MESSAGE}` })
  @IsISO8601({ strict: true })
  readonly to?: string;
}
