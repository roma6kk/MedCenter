import { BadRequestException } from '@nestjs/common';

/** API §9: a report or audit query may span at most 366 days (a leap year). */
export const MAX_RANGE_DAYS = 366;

/** Window used when the caller omits a bound (the audit table asks for `?page=` only). */
export const DEFAULT_RANGE_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * RFC 3339 `full-date` or `date-time` (API §0). Reduced-precision ISO 8601
 * dates (`2026`, `2026-10`) are refused: JS would read them as the instant the
 * period starts and silently report a one-millisecond window.
 */
export const RFC3339_DATE_OR_DATE_TIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** A date-time without `Z`/offset: JS would read it in the server's zone, the API means UTC. */
const ZONELESS_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?$/;

/** Raw `from`/`to` query values (RFC 3339 date or date-time, UTC). */
export interface DateRangeInput {
  readonly from?: string;
  readonly to?: string;
}

/**
 * Half-open period `[from, toExclusive)`. The read-model SQL and the HAPI
 * search (`ge`/`lt`) use the same bounds, so both sources count one period.
 */
export interface DateRange {
  readonly from: Date;
  readonly toExclusive: Date;
}

function invalidRange(message: string): BadRequestException {
  return new BadRequestException({ errorCode: 'VALIDATION_ERROR', message: `Invalid date range: ${message}` });
}

function parseInstant(value: string, field: 'from' | 'to'): Date {
  if (!RFC3339_DATE_OR_DATE_TIME.test(value)) {
    throw invalidRange(`"${field}" must be an RFC 3339 date (YYYY-MM-DD) or date-time`);
  }
  const instant = new Date(ZONELESS_DATE_TIME_PATTERN.test(value) ? `${value}Z` : value);
  if (Number.isNaN(instant.getTime())) {
    throw invalidRange(`"${field}" is not a calendar date or date-time`);
  }
  return instant;
}

/** A date-only `to` covers its whole UTC day; a date-time `to` is an inclusive instant. */
function upperBound(to: string): Date {
  const instant = parseInstant(to, 'to');
  const extraMs = DATE_ONLY_PATTERN.test(to) ? DAY_MS : 1;
  return new Date(instant.getTime() + extraMs);
}

function startOfNextUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

/**
 * Resolves and validates the reporting period (API §9.1–9.4): defaults to the
 * last {@link DEFAULT_RANGE_DAYS} days, rejects `from > to` and spans over
 * {@link MAX_RANGE_DAYS} days with `400 VALIDATION_ERROR`.
 */
export function resolveDateRange(input: DateRangeInput, now: Date = new Date()): DateRange {
  const toExclusive = input.to === undefined ? startOfNextUtcDay(now) : upperBound(input.to);
  const from =
    input.from === undefined
      ? new Date(toExclusive.getTime() - DEFAULT_RANGE_DAYS * DAY_MS)
      : parseInstant(input.from, 'from');
  if (from.getTime() >= toExclusive.getTime()) {
    throw invalidRange('"from" must not be after "to"');
  }
  if (toExclusive.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
    throw invalidRange(`the period must not exceed ${MAX_RANGE_DAYS} days`);
  }
  return { from, toExclusive };
}

/** Inclusive `MeasureReport.period` view of a half-open range. */
export function toInclusivePeriod(range: DateRange): { readonly start: string; readonly end: string } {
  return {
    start: range.from.toISOString(),
    end: new Date(range.toExclusive.getTime() - 1).toISOString(),
  };
}
