import { isCalendarDate } from '@/lib/contracts';
import { clinicDateKey, daysBetween, shiftDateKey } from '@/lib/clinic-time';
import { MAX_HORIZON_DAYS } from './schedule-windows';
import type { AdminSchedule } from './schedule-types';

export interface GenerationRange {
  readonly from: string;
  readonly to: string;
}

export type PeriodError = 'invalid' | 'order' | 'span';
export type GenerationRangeError = PeriodError | 'outsideHorizon';

const DEFAULT_GENERATION_DAYS = 14;

export function defaultGenerationRange(schedule: AdminSchedule, today: string = clinicDateKey()): GenerationRange {
  const horizonFrom: string | undefined = schedule.horizonFrom;
  const horizonTo: string | undefined = schedule.horizonTo;
  const from: string = horizonFrom !== undefined && horizonFrom > today ? horizonFrom : today;
  const wanted: string = shiftDateKey(from, DEFAULT_GENERATION_DAYS);
  const to: string = horizonTo !== undefined && horizonTo < wanted ? horizonTo : wanted;
  return { from, to: to < from ? from : to };
}

export function validatePeriod(range: GenerationRange): PeriodError | null {
  if (!isCalendarDate(range.from) || !isCalendarDate(range.to)) return 'invalid';
  const span: number = daysBetween(range.from, range.to);
  if (span < 0) return 'order';
  if (span > MAX_HORIZON_DAYS) return 'span';
  return null;
}

export function validateGenerationRange(range: GenerationRange, schedule: AdminSchedule): GenerationRangeError | null {
  const periodError: PeriodError | null = validatePeriod(range);
  if (periodError !== null) return periodError;
  const { horizonFrom, horizonTo } = schedule;
  if ((horizonFrom !== undefined && range.from < horizonFrom) || (horizonTo !== undefined && range.to > horizonTo)) return 'outsideHorizon';
  return null;
}
