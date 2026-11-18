import { CLINIC_TIME_ZONE, isDateKey, shiftDateKey } from '@/lib/clinic-time';
import { weekdayIndex } from '@/lib/calendar-grid';
import type { Locale } from '@/lib/i18n/locale';
import type { AppointmentState, JournalAppointment } from './doctor-types';

const MS_PER_MINUTE = 60_000;
const GAP_MIN_MINUTES = 30;
export const HALF_HOUR_PX = 40;
const DEFAULT_GRID_START_HOUR = 9;
const DEFAULT_GRID_END_HOUR = 17;
export const WEEK_DAYS = 5;

// patient-service admits a doctor only via a care relation (booked, arrived, checked-in, fulfilled); other rows give 403.
export function canOpenPatientCard(status: AppointmentState): boolean {
  return status !== 'cancelled' && status !== 'noshow';
}

export interface VisitEntry {
  readonly kind: 'visit';
  readonly visit: JournalAppointment;
  readonly isNext: boolean;
}

export interface GapEntry {
  readonly kind: 'gap';
  readonly start: string;
  readonly minutes: number;
}

export interface NowEntry {
  readonly kind: 'now';
  readonly start: string;
}

export type TimelineEntry = VisitEntry | GapEntry | NowEntry;

export function patientNameOf(visit: JournalAppointment, t: (key: string, values?: Record<string, string | number>) => string): string {
  return visit.patientName ?? t('unknownPatient', { id: visit.patientId });
}

export function visitMinutes(visit: JournalAppointment): number {
  return Math.max(0, Math.round((Date.parse(visit.end) - Date.parse(visit.start)) / MS_PER_MINUTE));
}

export function findNextVisit(visits: ReadonlyArray<JournalAppointment>): JournalAppointment | undefined {
  return [...visits].sort(byStart).find((visit) => visit.status === 'booked');
}

function byStart(a: JournalAppointment, b: JournalAppointment): number {
  return Date.parse(a.start) - Date.parse(b.start);
}

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

export function withNowLine(entries: ReadonlyArray<TimelineEntry>, nowMs: number): ReadonlyArray<TimelineEntry> {
  const index: number = entries.findIndex((entry) => entry.kind !== 'now' && Date.parse(entry.kind === 'visit' ? entry.visit.start : entry.start) > nowMs);
  const line: NowEntry = { kind: 'now', start: new Date(nowMs).toISOString() };
  return index === -1 ? [...entries, line] : [...entries.slice(0, index), line, ...entries.slice(index)];
}

export type StatusCounts = Readonly<Record<AppointmentState, number>> & { readonly total: number };

export function countByStatus(visits: ReadonlyArray<JournalAppointment>): StatusCounts {
  const counts: Record<AppointmentState, number> = { booked: 0, fulfilled: 0, noshow: 0, cancelled: 0 };
  for (const visit of visits) counts[visit.status] += 1;
  return { ...counts, total: visits.length };
}

export function shortName(fullName: string): string {
  const [surname, given] = fullName.trim().split(/\s+/);
  if (surname === undefined || surname === '') return fullName;
  return given === undefined ? surname : `${surname} ${[...given][0]?.toUpperCase() ?? ''}.`;
}

export function initialsOf(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => [...part][0]?.toUpperCase() ?? '')
    .join('');
}

export function workingDays(from: string, count: number = WEEK_DAYS): ReadonlyArray<string> {
  if (!isDateKey(from)) return [];
  const days: string[] = [];
  let cursor: string = from;
  while (days.length < count) {
    if (weekdayIndex(cursor) < WEEK_DAYS) days.push(cursor);
    cursor = shiftDateKey(cursor, 1);
  }
  return days;
}

export function weekdayShort(dateKey: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${dateKey}T12:00:00Z`));
}

export function rangeLabel(days: ReadonlyArray<string>): string {
  const first: string | undefined = days[0];
  const last: string | undefined = days.at(-1);
  if (first === undefined || last === undefined) return '';
  const [, firstMonth, firstDay] = first.split('-');
  const [, lastMonth, lastDay] = last.split('-');
  return firstMonth === lastMonth ? `${firstDay}–${lastDay}.${lastMonth}` : `${firstDay}.${firstMonth}–${lastDay}.${lastMonth}`;
}

let clockFormatter: Intl.DateTimeFormat | null = null;

export function clinicMinutes(iso: string): number {
  clockFormatter ??= new Intl.DateTimeFormat('en-GB', { timeZone: CLINIC_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const parts: Intl.DateTimeFormatPart[] = clockFormatter.formatToParts(new Date(iso));
  const value = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return value('hour') * 60 + value('minute');
}

export interface WeekBlock {
  readonly visit: JournalAppointment;
  readonly top: number;
  readonly height: number;
  readonly left: number;
  readonly width: number;
}

interface GridRange {
  readonly startHour: number;
  readonly endHour: number;
}

export function gridRange(days: ReadonlyArray<ReadonlyArray<JournalAppointment>>): GridRange {
  let startHour = DEFAULT_GRID_START_HOUR;
  let endHour = DEFAULT_GRID_END_HOUR;
  for (const visits of days) {
    for (const visit of visits) {
      startHour = Math.min(startHour, Math.floor(clinicMinutes(visit.start) / 60));
      endHour = Math.max(endHour, Math.ceil((clinicMinutes(visit.start) + Math.max(visitMinutes(visit), 30)) / 60));
    }
  }
  return { startHour, endHour: Math.min(endHour, 24) };
}

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
