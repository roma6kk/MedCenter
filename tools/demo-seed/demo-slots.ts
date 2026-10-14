import { createHash } from 'node:crypto';

import { MEDCENTER_EXT } from '../../libs/terminology/src/lib/extension-urls';
import type { FhirResource } from '../shared/fhir-http';
import { CLINIC_UTC_OFFSET_MINUTES, type DayCode } from './demo-catalog';

/**
 * Slot expansion with exactly the semantics of catalog-service
 * (`planSlots` in `schedules/slot-planner.ts`), so the seed and
 * `POST /admin/schedules/{id}/slots` agree on every slot: same ids, same
 * instants, same fields. A slot the service would generate for a schedule the
 * seed already filled is therefore skipped as "existing", never duplicated.
 * `demo-slots-parity.spec.ts` pins the two together.
 *
 * Semantics worth knowing (they are the service's, not choices made here):
 * - window times are **clinic wall-clock** (API §5.2.1, Europe/Minsk, UTC+3):
 *   `09:00` on a Monday is 06:00Z, and the stored window stays `09:00`;
 * - the weekday of a window is the weekday of the clinic calendar day;
 * - a slot is only emitted when it fits entirely inside the window.
 */

export interface WeeklyWindow {
  readonly dayOfWeek: DayCode;
  readonly startTime: string;
  readonly endTime: string;
}

export interface SlotInterval {
  readonly start: string;
  readonly end: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTES_PER_DAY = 24 * 60;
const MINUTE_MS = 60_000;
const CLINIC_OFFSET_MS = CLINIC_UTC_OFFSET_MINUTES * MINUTE_MS;
/** Index = `Date#getUTCDay()` (Sunday is 0), applied to a calendar date at UTC midnight. */
const CALENDAR_DAY_CODES: readonly DayCode[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  if (hours === undefined || minutes === undefined || Number.isNaN(hours) || Number.isNaN(minutes)) {
    throw new Error(`"${time}" is not an HH:mm time`);
  }
  return hours * 60 + minutes;
}

/**
 * The weekly windows of a schedule, as the clinic's wall-clock hours on each
 * listed day. They are stored as given (no time-zone shift): the generator
 * reads them as clinic time. A window must fit one clinic day.
 */
export function clinicWindows(days: readonly DayCode[], start: string, end: string): WeeklyWindow[] {
  const startMinute = toMinutes(start);
  const endMinute = toMinutes(end);
  if (startMinute < 0 || endMinute > MINUTES_PER_DAY || startMinute >= endMinute) {
    throw new Error(`Window ${start}-${end} (clinic time) does not fit one clinic day`);
  }
  return days.map((dayOfWeek) => ({ dayOfWeek, startTime: start, endTime: end }));
}

/** `YYYY-MM-DD` of the clinic calendar day an instant falls on (Minsk is UTC+3, so after 21:00Z it is already tomorrow). */
export function clinicDateOf(instant: Date): string {
  return new Date(instant.getTime() + CLINIC_OFFSET_MS).toISOString().slice(0, 10);
}

/** A calendar day as its UTC-midnight epoch; the day's weekday is read off it. */
function calendarDayMs(day: string): number {
  const epochMs = DAY_PATTERN.test(day) ? Date.parse(`${day}T00:00:00Z`) : Number.NaN;
  if (!Number.isFinite(epochMs)) {
    throw new Error(`"${day}" is not a date`);
  }
  return epochMs;
}

/** The instant `minute` minutes after midnight of a clinic calendar day (given as its UTC-midnight epoch). */
function clinicInstantMs(calendarMs: number, minute: number): number {
  return calendarMs - CLINIC_OFFSET_MS + minute * MINUTE_MS;
}

function splitWindow(calendarMs: number, window: WeeklyWindow, durationMin: number): SlotInterval[] {
  const slots: SlotInterval[] = [];
  const endMinute = toMinutes(window.endTime);
  for (let minute = toMinutes(window.startTime); minute + durationMin <= endMinute; minute += durationMin) {
    slots.push({
      start: new Date(clinicInstantMs(calendarMs, minute)).toISOString(),
      end: new Date(clinicInstantMs(calendarMs, minute + durationMin)).toISOString(),
    });
  }
  return slots;
}

/**
 * Every slot of `windows` on the clinic calendar days `fromDay..toDay` (both
 * inclusive), in chronological order per day. A non-positive duration yields
 * nothing (it would never advance the loop), like the service.
 */
export function expandSlotIntervals(
  fromDay: string,
  toDay: string,
  windows: readonly WeeklyWindow[],
  durationMin: number,
): SlotInterval[] {
  const intervals: SlotInterval[] = [];
  const lastMs = calendarDayMs(toDay);
  for (let cursor = calendarDayMs(fromDay); cursor <= lastMs && durationMin > 0; cursor += DAY_MS) {
    const dayCode = CALENDAR_DAY_CODES[new Date(cursor).getUTCDay()];
    for (const window of windows.filter((candidate) => candidate.dayOfWeek === dayCode)) {
      intervals.push(...splitWindow(cursor, window, durationMin));
    }
  }
  return intervals;
}

/**
 * Deterministic Slot id: the SHA-256 digest of `<scheduleId>|<start>` cut to the
 * 64 characters of the FHIR id grammar (same function as the generator).
 */
export function slotId(scheduleId: string, start: string): string {
  return createHash('sha256').update(`${scheduleId}|${start}`).digest('hex').slice(0, 64);
}

/** A free `Slot`, field for field what the generator writes (actors copied from the Schedule). */
export function buildSlot(
  scheduleId: string,
  interval: SlotInterval,
  actors: ReadonlyArray<{ readonly reference: string }>,
): FhirResource {
  return {
    resourceType: 'Slot',
    id: slotId(scheduleId, interval.start),
    schedule: { reference: `Schedule/${scheduleId}` },
    status: 'free',
    start: interval.start,
    end: interval.end,
    ...(actors.length === 0
      ? {}
      : { extension: [{ url: MEDCENTER_EXT.SLOT_ACTORS, valueString: JSON.stringify(actors) }] }),
  };
}
