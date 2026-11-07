import { addMonths, daysInMonth, keyOf, partsOf, weekdayIndex } from '@/lib/calendar-grid';
import { daysBetween, isDateKey, shiftDateKey } from '@/lib/clinic-time';
import { validateReportRange, type ReportRange } from '../shared/report-range';
import { DEFAULT_TOP, TOP_OPTIONS } from './analytics-types';

export type PeriodPreset = 'today' | 'week' | 'month' | 'year' | 'custom';

export const PERIOD_PRESETS: ReadonlyArray<PeriodPreset> = ['today', 'week', 'month', 'year', 'custom'];

export const DEFAULT_PRESET: PeriodPreset = 'month';

export interface AnalyticsScope {
  readonly preset: PeriodPreset;
  readonly range: ReportRange;
  readonly top: number;
}

export function presetRange(preset: Exclude<PeriodPreset, 'custom'>, today: string): ReportRange {
  const { year, month } = partsOf(today);
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'week') {
    const monday: string = shiftDateKey(today, -weekdayIndex(today));
    return { from: monday, to: shiftDateKey(monday, 6) };
  }
  if (preset === 'month') return { from: keyOf({ year, month, day: 1 }), to: keyOf({ year, month, day: daysInMonth(year, month) }) };
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function previousRange(preset: PeriodPreset, range: ReportRange): ReportRange {
  if (preset === 'today') return { from: shiftDateKey(range.from, -1), to: shiftDateKey(range.from, -1) };
  if (preset === 'week') return { from: shiftDateKey(range.from, -7), to: shiftDateKey(range.from, -1) };
  if (preset === 'month') {
    const first: string = addMonths(range.from, -1);
    const { year, month } = partsOf(first);
    return { from: first, to: keyOf({ year, month, day: daysInMonth(year, month) }) };
  }
  if (preset === 'year') {
    const year: number = partsOf(range.from).year - 1;
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  const length: number = daysBetween(range.from, range.to) + 1;
  return { from: shiftDateKey(range.from, -length), to: shiftDateKey(range.from, -1) };
}

export function defaultScope(today: string): AnalyticsScope {
  return { preset: DEFAULT_PRESET, range: presetRange('month', today), top: DEFAULT_TOP };
}

export function scopeFromParams(params: URLSearchParams, today: string): AnalyticsScope {
  const rawPeriod: string | null = params.get('period');
  const preset: PeriodPreset = PERIOD_PRESETS.find((candidate) => candidate === rawPeriod) ?? DEFAULT_PRESET;
  const rawTop: number = Number(params.get('top'));
  const top: number = TOP_OPTIONS.includes(rawTop) ? rawTop : DEFAULT_TOP;
  if (preset === 'custom') {
    const from: string = params.get('from') ?? '';
    const to: string = params.get('to') ?? '';
    const range: ReportRange = { from, to };
    if (isDateKey(from) && isDateKey(to) && validateReportRange(range) === null) return { preset, range, top };
    return { ...defaultScope(today), top };
  }
  return { preset, range: presetRange(preset, today), top };
}

export function scopeToQuery(scope: AnalyticsScope): string {
  const params = new URLSearchParams();
  if (scope.preset !== DEFAULT_PRESET) params.set('period', scope.preset);
  if (scope.preset === 'custom') {
    params.set('from', scope.range.from);
    params.set('to', scope.range.to);
  }
  if (scope.top !== DEFAULT_TOP) params.set('top', String(scope.top));
  return params.toString();
}

// A preset follows the clock (a page left open overnight moves to the new day); a custom one is fixed.
export function withToday(scope: AnalyticsScope, today: string): AnalyticsScope {
  return scope.preset === 'custom' ? scope : { ...scope, range: presetRange(scope.preset, today) };
}
