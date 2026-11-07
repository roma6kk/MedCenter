import { createHash } from 'node:crypto';

import { MEDCENTER_EXT } from '../../libs/terminology/src/lib/extension-urls';
import type { FhirResource } from '../shared/fhir-http';
import { CLINIC_UTC_OFFSET_MINUTES, type DayCode } from './demo-catalog';

export interface WeeklyWindow {
  readonly dayOfWeek: DayCode;
  readonly startTime: string;
  readonly endTime: string;
}

interface SlotInterval {
  readonly start: string;
  readonly end: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTES_PER_DAY = 24 * 60;
const MINUTE_MS = 60_000;
const CLINIC_OFFSET_MS = CLINIC_UTC_OFFSET_MINUTES * MINUTE_MS;
const CALENDAR_DAY_CODES: readonly DayCode[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  if (hours === undefined || minutes === undefined || Number.isNaN(hours) || Number.isNaN(minutes)) {
    throw new Error(`"${time}" is not an HH:mm time`);
  }
  return hours * 60 + minutes;
}

export function clinicWindows(days: readonly DayCode[], start: string, end: string): WeeklyWindow[] {
  const startMinute = toMinutes(start);
  const endMinute = toMinutes(end);
  if (startMinute < 0 || endMinute > MINUTES_PER_DAY || startMinute >= endMinute) {
    throw new Error(`Window ${start}-${end} (clinic time) does not fit one clinic day`);
  }
  return days.map((dayOfWeek) => ({ dayOfWeek, startTime: start, endTime: end }));
}

// Minsk is UTC+3, so after 21:00Z it is already tomorrow.
export function clinicDateOf(instant: Date): string {
  return new Date(instant.getTime() + CLINIC_OFFSET_MS).toISOString().slice(0, 10);
}

function calendarDayMs(day: string): number {
  const epochMs = DAY_PATTERN.test(day) ? Date.parse(`${day}T00:00:00Z`) : Number.NaN;
  if (!Number.isFinite(epochMs)) {
    throw new Error(`"${day}" is not a date`);
  }
  return epochMs;
}

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

export function slotId(scheduleId: string, start: string): string {
  return createHash('sha256').update(`${scheduleId}|${start}`).digest('hex').slice(0, 64);
}

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
