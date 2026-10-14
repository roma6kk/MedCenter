import { BadRequestException } from '@nestjs/common';

import { addClinicDays, clinicDateOf, clinicDayEndMs, clinicDayStartMs } from '../../common/clinic-calendar';

/** Inclusive window of instants (epoch milliseconds). */
export interface InstantRange {
  readonly fromMs: number;
  readonly toMs: number;
}

/**
 * Resolved, validated slot search window. `from`/`to` echo the request (or the
 * defaults); `fromMs`/`toMs` are the instants they stand for, which is what
 * every FHIR search and filter uses. A date-only bound means a clinic calendar
 * day (`from` its first instant, `to` its last, like API §5.2.6), so HAPI never
 * reads a bare date in its own server zone.
 */
export interface SlotRange extends InstantRange {
  readonly from: string;
  readonly to: string;
}

/**
 * Window used when the client omits `to`. The booking screen has no date
 * picker yet, so this is the whole horizon a patient can reach: two weeks.
 */
export const DEFAULT_SLOT_RANGE_DAYS = 14;

/**
 * Upper bound of one slot query. A public, unauthenticated endpoint must not be
 * able to request the whole 90-day horizon in one go; a month covers every
 * booking and doctor-calendar view of the frontend.
 */
export const MAX_SLOT_RANGE_DAYS = 31;

/**
 * How far ahead `from` may start. Planning is capped at 90 days per run, so a
 * year is generous; the bound keeps the per-doctor cache key space finite
 * (one page per clinic day) and refuses probes at the far future outright.
 */
export const MAX_SLOT_LOOKAHEAD_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function startInstant(bound: string): number {
  return DATE_ONLY.test(bound) ? clinicDayStartMs(bound) : Date.parse(bound);
}

function endInstant(bound: string): number {
  return DATE_ONLY.test(bound) ? clinicDayEndMs(bound) : Date.parse(bound);
}

/** Shifts a bound by whole days, keeping its form (date stays date, date-time stays date-time). */
function shiftDays(bound: string, days: number): string {
  return DATE_ONLY.test(bound)
    ? addClinicDays(bound, days)
    : new Date(Date.parse(bound) + days * DAY_MS).toISOString();
}

function invalidRange(message: string): BadRequestException {
  return new BadRequestException({ errorCode: 'VALIDATION_ERROR', message });
}

/**
 * Applies the defaults (`from` = today in clinic time, `to` = `from` + 14 days)
 * and the limits (`from` ≤ `to`, span ≤ 31 days, `from` ≤ 366 days ahead).
 * Format is already checked by `SlotRangeQueryDto`; this enforces the
 * cross-field rules a decorator cannot.
 */
export function resolveSlotRange(
  query: { readonly from?: string; readonly to?: string },
  nowMs: number = Date.now(),
): SlotRange {
  const today = clinicDateOf(nowMs);
  const from = query.from ?? today;
  const to = query.to ?? shiftDays(from, DEFAULT_SLOT_RANGE_DAYS);
  const spanDays = (Date.parse(to) - Date.parse(from)) / DAY_MS;
  const range: SlotRange = { from, to, fromMs: startInstant(from), toMs: endInstant(to) };
  if (!Number.isFinite(spanDays) || spanDays < 0 || range.toMs < range.fromMs) {
    throw invalidRange('range: `to` must not be before `from`');
  }
  if (spanDays > MAX_SLOT_RANGE_DAYS) {
    throw invalidRange(`range: must be within ${MAX_SLOT_RANGE_DAYS} days`);
  }
  if (range.fromMs - clinicDayStartMs(today) > MAX_SLOT_LOOKAHEAD_DAYS * DAY_MS) {
    throw invalidRange(`range: \`from\` must be within ${MAX_SLOT_LOOKAHEAD_DAYS} days from today`);
  }
  return range;
}
