export type WeekDay = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export interface WeeklyWindow {
  readonly dayOfWeek: WeekDay;
  readonly startTime: string;
  readonly endTime: string;
}

const WEEK_ORDER: ReadonlyArray<WeekDay> = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export interface WindowGroup {
  readonly days: string;
  readonly times: string;
}

function timesOf(day: WeekDay, windows: ReadonlyArray<WeeklyWindow>): string {
  return windows
    .filter((window) => window.dayOfWeek === day)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((window) => `${window.startTime}–${window.endTime}`)
    .join(', ');
}

function runsOf(indexes: ReadonlyArray<number>): ReadonlyArray<readonly [number, number]> {
  const runs: Array<[number, number]> = [];
  for (const index of indexes) {
    const last: [number, number] | undefined = runs.at(-1);
    if (last !== undefined && last[1] === index - 1) last[1] = index;
    else runs.push([index, index]);
  }
  return runs;
}

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
        return to - from === 1 ? [first, last] : [`${first}–${last}`];
      });
      return { days: parts.join(', '), times };
    });
}
