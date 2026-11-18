import { axisLabel, bucketTitle } from './bucket-label';

const day = (from: string): { from: string; to: string; granularity: 'day' } => ({ from, to: from, granularity: 'day' });

describe('axisLabel', () => {
  it('should show a bare day number for a day column, with the month on the first column and on every 1st', () => {
    expect(axisLabel(day('2026-10-28'), 3, 'ru')).toBe('28');
    expect(axisLabel(day('2026-10-26'), 0, 'ru')).toMatch(/^26\s+окт/);
    expect(axisLabel(day('2026-11-01'), 6, 'ru')).toMatch(/^1\s+нояб/);
  });

  it('should show the first day of a week column and the month name of a month column', () => {
    expect(axisLabel({ from: '2026-10-12', to: '2026-10-18', granularity: 'week' }, 1, 'ru')).toMatch(/^12\s+окт/);
    expect(axisLabel({ from: '2026-02-01', to: '2026-02-28', granularity: 'month' }, 1, 'ru')).toMatch(/^февр/);
  });
});

describe('bucketTitle', () => {
  it('should spell the whole column out for the tooltip', () => {
    expect(bucketTitle(day('2026-10-28'), 'ru')).toBe('среда, 28 октября');
    expect(bucketTitle({ from: '2026-10-12', to: '2026-10-18', granularity: 'week' }, 'ru')).toMatch(/^12\s+окт.* – 18\s+окт/);
    expect(bucketTitle({ from: '2026-02-01', to: '2026-02-28', granularity: 'month' }, 'en')).toBe('February 2026');
  });
});
