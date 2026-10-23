/**
 * journal-model — pure shaping of the journal rows for the day timeline and the week grid. Nothing here reads the clock or
 * the network: the views pass in what the API returned, so every rule below is testable on plain objects.
 */
import { CLINIC_TIME_ZONE, isDateKey, shiftDateKey } from '@/lib/clinic-time';
import type { Locale } from '@/lib/i18n/locale';
import type { AppointmentState, JournalAppointment } from './doctor-types';

const MS_PER_MINUTE = 60_000;
/** A pause between two visits is shown as one line only from this length; shorter ones are just space between cards. */
export const GAP_MIN_MINUTES = 60;
/** Height of one half-hour row of the week grid, in px. */
export const HALF_HOUR_PX = 40;
const DEFAULT_GRID_START_HOUR = 9;
const DEFAULT_GRID_END_HOUR = 17;
export const WEEK_DAYS = 5;

/**
 * Whether the doctor may open the patient card of a row. patient-service lets a doctor in only through a care relation
 * (`CARE_APPOINTMENT_STATUSES`: booked, arrived, checked-in, fulfilled); a cancelled or no-show row would answer 403.
 */
export function canOpenPatientCard(status: AppointmentState): boolean {
  return status !== 'cancelled' && status !== 'noshow';
}

export interface VisitEntry {
  readonly kind: 'visit';
  readonly visit: JournalAppointment;
  /** The first booked visit of the loaded rows: the one the doctor sees next. */
  readonly isNext: boolean;
}

export interface GapEntry {
  readonly kind: 'gap';
  /** RFC 3339 instant the pause starts at (the end of the previous visit). */
  readonly start: string;
  readonly minutes: number;
}

export type TimelineEntry = VisitEntry | GapEntry;

export function visitMinutes(visit: JournalAppointment): number {
  return Math.max(0, Math.round((Date.parse(visit.end) - Date.parse(visit.start)) / MS_PER_MINUTE));
}

/** The first booked visit by time: a booked row is one the doctor has not dealt with yet, whatever the clock says. */
export function findNextVisit(visits: ReadonlyArray<JournalAppointment>): JournalAppointment | undefined {
  return [...visits].sort(byStart).find((visit) => visit.status === 'booked');
}

function byStart(a: JournalAppointment, b: JournalAppointment): number {
  return Date.parse(a.start) - Date.parse(b.start);
}

/** Visits in time order with a gap line between two of them when the doctor is free for at least `GAP_MIN_MINUTES`. */
export function buildTimeline(visits: ReadonlyArray<JournalAppointment>): ReadonlyArray<TimelineEntry> {
  const sorted: ReadonlyArray<JournalAppointment> = [...visits].sort(byStart);
  const next: JournalAppointment | undefined = findNextVisit(sorted);
  const entries: TimelineEntry[] = [];
  let busyUntil: number | null = null;
  for (const visit of sorted) {
    const start: number = Date.parse(visit.start);
    if (busyUntil !== null && (start - busyUntil) / MS_PER_MINUTE >= GAP_MIN_MINUTES) {
      entries.push({ kind: 'gap', start: new Date(busyUntil).toISOString(), minutes: Math.round((start - busyUntil) / MS_PER_MINUTE) });
    }
    entries.push({ kind: 'visit', visit, isNext: visit.id === next?.id });
    busyUntil = Math.max(busyUntil ?? 0, Date.parse(visit.end));
  }
  return entries;
}

export type StatusCounts = Readonly<Record<AppointmentState, number>> & { readonly total: number };

export function countByStatus(visits: ReadonlyArray<JournalAppointment>): StatusCounts {
  const counts: Record<AppointmentState, number> = { booked: 0, fulfilled: 0, noshow: 0, cancelled: 0 };
  for (const visit of visits) counts[visit.status] += 1;
  return { ...counts, total: visits.length };
}

/** `Кузнецов Алексей Петрович` → `Кузнецов А.`: the grid has room for a surname and an initial only. */
export function shortName(fullName: string): string {
  const [surname, given] = fullName.trim().split(/\s+/);
  if (surname === undefined || surname === '') return fullName;
  return given === undefined ? surname : `${surname} ${[...given][0]?.toUpperCase() ?? ''}.`;
}

/** Up to two initials for an avatar (`Кузнецов Павел` → `КП`). */
export function initialsOf(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => [...part][0]?.toUpperCase() ?? '')
    .join('');
}

// ---------------------------------------------------------------------------------------------------------------------
// Week
// ---------------------------------------------------------------------------------------------------------------------

/** 0 = Sunday … 6 = Saturday of a `YYYY-MM-DD` key (calendar arithmetic in UTC, no zone drift). */
function weekdayIndex(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}

/** `count` working days (Monday to Friday) starting from `from`, or from the next working day when `from` is a weekend. */
export function workingDays(from: string, count: number = WEEK_DAYS): ReadonlyArray<string> {
  if (!isDateKey(from)) return [];
  const days: string[] = [];
  let cursor: string = from;
  while (days.length < count) {
    const weekday: number = weekdayIndex(cursor);
    if (weekday !== 0 && weekday !== 6) days.push(cursor);
    cursor = shiftDateKey(cursor, 1);
  }
  return days;
}

/** Short weekday of a day key (`ср`, `Wed`). */
export function weekdayShort(dateKey: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${dateKey}T12:00:00Z`));
}

/** `21–27.10` for a period of days. */
export function rangeLabel(days: ReadonlyArray<string>): string {
  const first: string | undefined = days[0];
  const last: string | undefined = days.at(-1);
  if (first === undefined || last === undefined) return '';
  const [, firstMonth, firstDay] = first.split('-');
  const [, lastMonth, lastDay] = last.split('-');
  return firstMonth === lastMonth ? `${firstDay}–${lastDay}.${lastMonth}` : `${firstDay}.${firstMonth}–${lastDay}.${lastMonth}`;
}

let clockFormatter: Intl.DateTimeFormat | null = null;

/** Minutes since midnight of an instant in the clinic zone. */
export function clinicMinutes(iso: string): number {
  clockFormatter ??= new Intl.DateTimeFormat('en-GB', { timeZone: CLINIC_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const parts: Intl.DateTimeFormatPart[] = clockFormatter.formatToParts(new Date(iso));
  const value = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return value('hour') * 60 + value('minute');
}

export interface WeekBlock {
  readonly visit: JournalAppointment;
  /** px from the top of the grid. */
  readonly top: number;
  readonly height: number;
  /** Share of the column, in percent: overlapping visits stand side by side. */
  readonly left: number;
  readonly width: number;
}

export interface GridRange {
  /** First and last hour drawn on the grid (`last` is the hour of the closing line). */
  readonly startHour: number;
  readonly endHour: number;
}

/** 09:00–17:00 unless a visit falls outside it; the grid grows to the hour that holds it. */
export function gridRange(days: ReadonlyArray<ReadonlyArray<JournalAppointment>>): GridRange {
  let startHour = DEFAULT_GRID_START_HOUR;
  let endHour = DEFAULT_GRID_END_HOUR;
  for (const visits of days) {
    for (const visit of visits) {
      startHour = Math.min(startHour, Math.floor(clinicMinutes(visit.start) / 60));
      endHour = Math.max(endHour, Math.ceil(clinicMinutes(visit.start) / 60 + visitMinutes(visit) / 60));
    }
  }
  return { startHour, endHour: Math.min(endHour, 24) };
}

/** Positions the visits of one day in the grid; visits that overlap in time share the width of the column. */
export function layoutBlocks(visits: ReadonlyArray<JournalAppointment>, startHour: number): ReadonlyArray<WeekBlock> {
  const sorted: ReadonlyArray<JournalAppointment> = [...visits].sort(byStart);
  const blocks: WeekBlock[] = [];
  let cluster: Array<{ visit: JournalAppointment; column: number; end: number }> = [];
  let clusterEnd = 0;
  const flush = (): void => {
    const columns: number = Math.max(1, ...cluster.map((item) => item.column + 1));
    for (const item of cluster) {
      const minutes: number = clinicMinutes(item.visit.start) - startHour * 60;
      const height: number = Math.max(HALF_HOUR_PX, (visitMinutes(item.visit) / 30) * HALF_HOUR_PX);
      blocks.push({ visit: item.visit, top: (minutes / 30) * HALF_HOUR_PX, height, left: (item.column / columns) * 100, width: 100 / columns });
    }
    cluster = [];
  };
  for (const visit of sorted) {
    const start: number = Date.parse(visit.start);
    if (cluster.length > 0 && start >= clusterEnd) flush();
    const taken = new Set(cluster.filter((item) => item.end > start).map((item) => item.column));
    let column = 0;
    while (taken.has(column)) column += 1;
    const end: number = Date.parse(visit.end);
    cluster.push({ visit, column, end });
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return blocks;
}
