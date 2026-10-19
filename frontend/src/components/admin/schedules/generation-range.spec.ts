import { defaultGenerationRange, validateGenerationRange, validatePeriod } from './generation-range';
import type { AdminSchedule } from './schedule-types';

const schedule: AdminSchedule = { id: 's1', isActive: true, horizonFrom: '2026-10-16', horizonTo: '2026-11-15', windows: [] };

describe('defaultGenerationRange', () => {
  it('should cover the next two weeks from today when the horizon is wide enough', () => {
    expect(defaultGenerationRange(schedule, '2026-10-16')).toEqual({ from: '2026-10-16', to: '2026-10-30' });
  });

  it('should stop at the end of the horizon when it ends sooner', () => {
    expect(defaultGenerationRange({ ...schedule, horizonTo: '2026-10-20' }, '2026-10-16')).toEqual({ from: '2026-10-16', to: '2026-10-20' });
  });

  it('should open at the first day of the horizon when the schedule starts later', () => {
    expect(defaultGenerationRange({ ...schedule, horizonFrom: '2026-11-01', horizonTo: '2026-12-01' }, '2026-10-16')).toEqual({ from: '2026-11-01', to: '2026-11-15' });
  });

  it('should collapse to one day when the horizon is already over', () => {
    expect(defaultGenerationRange({ ...schedule, horizonFrom: '2026-09-01', horizonTo: '2026-09-30' }, '2026-10-16')).toEqual({ from: '2026-10-16', to: '2026-10-16' });
  });
});

describe('validateGenerationRange', () => {
  it('should accept a period when it is inside the horizon', () => {
    expect(validateGenerationRange({ from: '2026-10-16', to: '2026-10-30' }, schedule)).toBeNull();
  });

  it('should accept the whole horizon when the period equals it', () => {
    expect(validateGenerationRange({ from: '2026-10-16', to: '2026-11-15' }, schedule)).toBeNull();
  });

  it('should refuse unreadable dates with the invalid reason when a date is empty', () => {
    expect(validateGenerationRange({ from: '', to: '2026-10-30' }, schedule)).toBe('invalid');
  });

  it('should refuse a period with the order reason when it ends before it starts', () => {
    expect(validateGenerationRange({ from: '2026-10-30', to: '2026-10-20' }, schedule)).toBe('order');
  });

  it('should refuse a period with the outsideHorizon reason when it starts before or ends after the horizon', () => {
    expect(validateGenerationRange({ from: '2026-10-15', to: '2026-10-30' }, schedule)).toBe('outsideHorizon');
    expect(validateGenerationRange({ from: '2026-10-16', to: '2026-11-16' }, schedule)).toBe('outsideHorizon');
  });

  it('should refuse a period with the span reason when it is over 90 days, before the horizon check', () => {
    const wide: AdminSchedule = { ...schedule, horizonFrom: '2026-01-01', horizonTo: '2027-01-01' };

    expect(validateGenerationRange({ from: '2026-01-01', to: '2026-04-15' }, wide)).toBe('span');
  });
});

describe('validatePeriod', () => {
  it('should accept two days when they are in order and up to 90 days apart', () => {
    expect(validatePeriod({ from: '2026-10-16', to: '2027-01-14' })).toBeNull();
  });

  it.each([
    ['an empty date', { from: '', to: '2026-10-30' }, 'invalid'],
    ['a reversed order', { from: '2026-10-30', to: '2026-10-20' }, 'order'],
    ['more than 90 days', { from: '2026-10-16', to: '2027-01-15' }, 'span'],
  ])('should refuse %s when the period is checked', (_label, range, reason) => {
    expect(validatePeriod(range)).toBe(reason);
  });
});
