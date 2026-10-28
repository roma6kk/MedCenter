/**
 * schedule-windows-text — a schedule's weekly windows in the words a person would say (A11): `Пн–Пт, 09:00–13:00`, not
 * `MO/TU/WE/TH/FR 09:00-13:00` and not a table of seven rows. Days that have the same windows are put together, and a run
 * of neighbouring days becomes a range.
 */
export type WeekDay = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

/** The shape both the doctor's schedule and the admin's list carry. */
export interface WeeklyWindow {
  readonly dayOfWeek: WeekDay;
  readonly startTime: string;
  readonly endTime: string;
}

const WEEK_ORDER: ReadonlyArray<WeekDay> = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export interface WindowGroup {
  /** `Пн–Пт` or `Пн, Ср, Пт`. */
  readonly days: string;
  /** `09:00–13:00, 14:00–17:00`. */
  readonly times: string;
}

function timesOf(day: WeekDay, windows: ReadonlyArray<WeeklyWindow>): string {
  return windows
    .filter((window) => window.dayOfWeek === day)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((window) => `${window.startTime}–${window.endTime}`)
    .join(', ');
}

/** Consecutive weekday indexes of one group as ranges: `[0,1,2,3,4]` → `[[0,4]]`, `[0,2,4]` → `[[0,0],[2,2],[4,4]]`. */
function runsOf(indexes: ReadonlyArray<number>): ReadonlyArray<readonly [number, number]> {
  const runs: Array<[number, number]> = [];
  for (const index of indexes) {
    const last: [number, number] | undefined = runs.at(-1);
    if (last !== undefined && last[1] === index - 1) last[1] = index;
    else runs.push([index, index]);
  }
  return runs;
}

/** Groups of days with identical windows, in the order of their first day. A day without a window is not listed. */
export function describeWindows(windows: ReadonlyArray<WeeklyWindow>, dayLabel: (day: WeekDay) => string): ReadonlyArray<WindowGroup> {
  const byTimes = new Map<string, number[]>();
  WEEK_ORDER.forEach((day, index) => {
    const times: string = timesOf(day, windows);
    if (times === '') return;
    byTimes.set(times, [...(byTimes.get(times) ?? []), index]);
  });
  return [...byTimes.entries()]
    .sort(([, a], [, b]) => (a[0] ?? 0) - (b[0] ?? 0))
    .map(([times, indexes]) => {
      const parts: ReadonlyArray<string> = runsOf(indexes).flatMap(([from, to]): ReadonlyArray<string> => {
        const first: string = dayLabel(WEEK_ORDER[from] as WeekDay);
        if (from === to) return [first];
        const last: string = dayLabel(WEEK_ORDER[to] as WeekDay);
        // Two neighbours read better as a list («Сб, Вс») than as a range.
        return to - from === 1 ? [first, last] : [`${first}–${last}`];
      });
      return { days: parts.join(', '), times };
    });
}
