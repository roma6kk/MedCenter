/** Belarus is UTC+3 all year (no DST): a fixed offset is exact. A date-only API bound is a clinic day, never a UTC one (HAPI would read a bare date in its own zone). */
export const CLINIC_TIME_ZONE = 'Europe/Minsk';

const CLINIC_UTC_OFFSET = '+03:00';
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const CLINIC_OFFSET_MS = 3 * 60 * MINUTE_MS;

export type DayCode = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

const DAY_CODES: readonly DayCode[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function clinicDateOf(epochMs: number): string {
  return new Date(epochMs + CLINIC_OFFSET_MS).toISOString().slice(0, 10);
}

export function clinicDayStartMs(date: string): number {
  return Date.parse(`${date}T00:00:00${CLINIC_UTC_OFFSET}`);
}

export function clinicDayEndMs(date: string): number {
  return clinicDayStartMs(date) + DAY_MS - 1;
}

export function clinicInstantMs(date: string, minuteOfDay: number): number {
  return clinicDayStartMs(date) + minuteOfDay * MINUTE_MS;
}

export function clinicDayCode(date: string): DayCode {
  return DAY_CODES[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? 'MO';
}

export function clinicDaysBetween(fromMs: number, toMs: number): string[] {
  const firstDayMs = Date.parse(`${clinicDateOf(fromMs)}T00:00:00Z`);
  const lastDayMs = Date.parse(`${clinicDateOf(toMs)}T00:00:00Z`);
  const days: string[] = [];
  for (let dayMs = firstDayMs; dayMs <= lastDayMs; dayMs += DAY_MS) {
    days.push(new Date(dayMs).toISOString().slice(0, 10));
  }
  return days;
}

export function addClinicDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

const CLINIC_FORMAT = new Intl.DateTimeFormat('ru-RU', {
  timeZone: CLINIC_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

interface ClinicMoment {
  readonly date: string;
  readonly time: string;
}

/** Built from `formatToParts`, so ICU punctuation differences between Node builds never reach the text a patient reads. */
function toClinicMoment(iso: string): ClinicMoment | undefined {
  const epochMs = Date.parse(iso);
  if (!Number.isFinite(epochMs)) {
    return undefined;
  }
  const parts = new Map(CLINIC_FORMAT.formatToParts(new Date(epochMs)).map((part) => [part.type, part.value]));
  return {
    date: `${parts.get('day')}.${parts.get('month')}.${parts.get('year')}`,
    time: `${parts.get('hour')}:${parts.get('minute')}`,
  };
}

/** `22.10.2026 12:30` in clinic time, or `undefined` for a value that is no instant. */
export function formatClinicDateTime(iso: string): string | undefined {
  const moment = toClinicMoment(iso);
  return moment && `${moment.date} ${moment.time}`;
}

/** `02.11.2026 12:00–12:30`; the end repeats the date only when it falls on another clinic day. */
export function formatSlotPeriod(start: string, end: string): string {
  const from = toClinicMoment(start);
  const to = toClinicMoment(end);
  if (from === undefined || to === undefined) {
    return `${start}–${end}`;
  }
  const endText = from.date === to.date ? to.time : `${to.date} ${to.time}`;
  return `${from.date} ${from.time}–${endText}`;
}
