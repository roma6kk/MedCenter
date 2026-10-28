import type { Slot } from '@/components/catalog/catalog-types';
import { shiftDateKey } from '@/lib/clinic-time';
import { MAX_LOOKAHEAD_DAYS, SLOT_WINDOW_DAYS, clampToHorizon, clampToToday, dayPartOf, slotDurationMin, slotWindow, windowDays } from './slot-time';

function slot(id: string, start: string, end: string, status: Slot['status'] = 'free'): Slot {
  return { id, scheduleId: 'sch-1', start, end, status };
}

describe('slotWindow', () => {
  it('should span two weeks, both ends inclusive, when no length is given', () => {
    expect(SLOT_WINDOW_DAYS).toBe(14);
    expect(slotWindow('2026-10-19')).toEqual({ from: '2026-10-19', to: '2026-11-01' });
  });

  it('should stay inside the 31 days the API accepts when the default window is used', () => {
    expect(SLOT_WINDOW_DAYS).toBeLessThanOrEqual(31);
  });
});

describe('clampToToday', () => {
  it('should keep the day when it is later than today', () => {
    expect(clampToToday('2026-10-25', '2026-10-19')).toBe('2026-10-25');
  });

  it('should move the first day to today when it is past, invalid or missing', () => {
    expect(clampToToday('2026-10-01', '2026-10-19')).toBe('2026-10-19');
    expect(clampToToday('nonsense', '2026-10-19')).toBe('2026-10-19');
    expect(clampToToday(undefined, '2026-10-19')).toBe('2026-10-19');
  });
});

describe('slotDurationMin', () => {
  it('should be the length of the slot in whole minutes when both bounds are dates', () => {
    expect(slotDurationMin(slot('a', '2026-10-19T11:00:00.000Z', '2026-10-19T11:20:00.000Z'))).toBe(20);
  });

  it('should be zero when the bounds of the slot are not dates', () => {
    expect(slotDurationMin(slot('a', 'nope', 'nope'))).toBe(0);
  });
});

describe('clampToHorizon', () => {
  const today = '2026-10-19';

  it('should keep a day inside the look-ahead when it is later than today', () => {
    expect(clampToHorizon('2026-12-01', today)).toBe('2026-12-01');
  });

  it('should stop at the last day the API accepts when the day is further ahead', () => {
    expect(clampToHorizon(shiftDateKey(today, MAX_LOOKAHEAD_DAYS + 30), today)).toBe(shiftDateKey(today, MAX_LOOKAHEAD_DAYS));
  });

  it('should move to today when the day is past or missing', () => {
    expect(clampToHorizon('2026-01-01', today)).toBe(today);
    expect(clampToHorizon(undefined, today)).toBe(today);
  });

  it('should stay inside the 366 days the API accepts when the horizon is used as a start', () => {
    expect(MAX_LOOKAHEAD_DAYS).toBeLessThanOrEqual(366);
  });
});

describe('dayPartOf', () => {
  it.each([
    ['2026-10-19T05:59:00.000Z', 'morning'],
    ['2026-10-19T08:59:00.000Z', 'morning'],
    ['2026-10-19T09:00:00.000Z', 'day'],
    ['2026-10-19T13:59:00.000Z', 'day'],
    ['2026-10-19T14:00:00.000Z', 'evening'],
  ])('should call %s the %s when the clinic wall clock (UTC+3) is read', (start, part) => {
    expect(dayPartOf(start)).toBe(part);
  });
});

describe('windowDays', () => {
  it('should list every day of the window when both ends are inclusive', () => {
    expect(windowDays({ from: '2026-10-30', to: '2026-11-02' })).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('should list fourteen days when the default window is given', () => {
    expect(windowDays(slotWindow('2026-10-19'))).toHaveLength(SLOT_WINDOW_DAYS);
  });

  it('should list nothing when the window ends before it starts', () => {
    expect(windowDays({ from: '2026-11-02', to: '2026-10-30' })).toEqual([]);
  });
});
