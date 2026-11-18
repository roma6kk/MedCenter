import { BadRequestException } from '@nestjs/common';
import { clinicDateOf, clinicDayStartMs } from '@medcenter/common';

export const MAX_RANGE_DAYS = 366;

const DEFAULT_RANGE_DAYS = 30;

const DAY_MS = 86_400_000;

// Reduced-precision dates (2026, 2026-10) are refused: JS reads them as an instant and would report a 1 ms window.
export const RFC3339_DATE_OR_DATE_TIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** A date-time without `Z`/offset: JS would read it in the server's zone, the API means UTC. */
const ZONELESS_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?$/;

export interface DateRangeInput {
  readonly from?: string;
  readonly to?: string;
}

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
  const instant = new Date(
    DATE_ONLY_PATTERN.test(value) ? clinicDayStartMs(value) : ZONELESS_DATE_TIME_PATTERN.test(value) ? `${value}Z` : value,
  );
  if (Number.isNaN(instant.getTime())) {
    throw invalidRange(`"${field}" is not a calendar date or date-time`);
  }
  return instant;
}

function upperBound(to: string): Date {
  const instant = parseInstant(to, 'to');
  const extraMs = DATE_ONLY_PATTERN.test(to) ? DAY_MS : 1;
  return new Date(instant.getTime() + extraMs);
}

// The clinic has no daylight saving, so a day is 24 h.
function startOfNextClinicDay(now: Date): Date {
  return new Date(clinicDayStartMs(clinicDateOf(now.getTime())) + DAY_MS);
}

export function resolveDateRange(input: DateRangeInput, now: Date = new Date()): DateRange {
  const toExclusive = input.to === undefined ? startOfNextClinicDay(now) : upperBound(input.to);
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

export function toInclusivePeriod(range: DateRange): { readonly start: string; readonly end: string } {
  return {
    start: range.from.toISOString(),
    end: new Date(range.toExclusive.getTime() - 1).toISOString(),
  };
}
