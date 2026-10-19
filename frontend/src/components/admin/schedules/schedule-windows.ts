/**
 * schedule-windows — pure rules of the weekly windows of a schedule, the same as the server's (BR-007,
 * `window-overlap.ts`): two windows overlap when they share a weekday and their minute ranges intersect.
 */
import { WEEK_DAYS, type WeekDay, type WeeklyWindow } from './schedule-types';

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
/** The planning horizon of one schedule is at most this many days (`horizonTo - horizonFrom`). */
export const MAX_HORIZON_DAYS = 90;

export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/** Both times are `HH:mm` and the window ends after it starts. */
export function isWindowValid(window: Pick<WeeklyWindow, 'startTime' | 'endTime'>): boolean {
  return TIME_PATTERN.test(window.startTime) && TIME_PATTERN.test(window.endTime) && toMinutes(window.endTime) > toMinutes(window.startTime);
}

function intersects(a: WeeklyWindow, b: WeeklyWindow): boolean {
  return a.dayOfWeek === b.dayOfWeek && toMinutes(a.startTime) < toMinutes(b.endTime) && toMinutes(b.startTime) < toMinutes(a.endTime);
}

/** Indexes of the windows that overlap another window (both sides of a pair are reported). Unreadable times are skipped. */
export function findOverlappingWindows(windows: ReadonlyArray<WeeklyWindow>): ReadonlySet<number> {
  const overlapping = new Set<number>();
  windows.forEach((a, i) => {
    windows.forEach((b, j) => {
      if (i < j && isWindowValid(a) && isWindowValid(b) && intersects(a, b)) {
        overlapping.add(i);
        overlapping.add(j);
      }
    });
  });
  return overlapping;
}

/** Windows ordered by weekday (MO first), then by start time. */
export function sortWindows(windows: ReadonlyArray<WeeklyWindow>): ReadonlyArray<WeeklyWindow> {
  return [...windows].sort((a, b) => WEEK_DAYS.indexOf(a.dayOfWeek) - WEEK_DAYS.indexOf(b.dayOfWeek) || toMinutes(a.startTime) - toMinutes(b.startTime));
}

/** The windows of one weekday, in start order. */
export function windowsOfDay(windows: ReadonlyArray<WeeklyWindow>, day: WeekDay): ReadonlyArray<WeeklyWindow> {
  return sortWindows(windows).filter((window) => window.dayOfWeek === day);
}
