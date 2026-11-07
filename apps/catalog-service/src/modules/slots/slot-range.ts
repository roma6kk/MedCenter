import { BadRequestException } from '@nestjs/common';
import { addClinicDays, clinicDateOf, clinicDayEndMs, clinicDayStartMs } from '@medcenter/common';

export interface InstantRange {
  readonly fromMs: number;
  readonly toMs: number;
}

export interface SlotRange extends InstantRange {
  readonly from: string;
  readonly to: string;
}

export const DEFAULT_SLOT_RANGE_DAYS = 14;

/** A public endpoint must not be asked for the whole 90-day horizon at once. */
export const MAX_SLOT_RANGE_DAYS = 31;

/** Keeps the per-doctor cache key space finite and refuses far-future probes. */
export const MAX_SLOT_LOOKAHEAD_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function startInstant(bound: string): number {
  return DATE_ONLY.test(bound) ? clinicDayStartMs(bound) : Date.parse(bound);
}

function endInstant(bound: string): number {
  return DATE_ONLY.test(bound) ? clinicDayEndMs(bound) : Date.parse(bound);
}

function shiftDays(bound: string, days: number): string {
  return DATE_ONLY.test(bound)
    ? addClinicDays(bound, days)
    : new Date(Date.parse(bound) + days * DAY_MS).toISOString();
}

function invalidRange(message: string): BadRequestException {
  return new BadRequestException({ errorCode: 'VALIDATION_ERROR', message });
}

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

export function clinicDayRange(from: string, to: string): InstantRange {
  return { fromMs: startInstant(from), toMs: endInstant(to) };
}
