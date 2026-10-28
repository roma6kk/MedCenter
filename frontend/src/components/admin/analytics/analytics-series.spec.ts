import { bucketsOf, granularityOf } from './analytics-series';

describe('granularityOf', () => {
  it('should cut by day up to 31 days, by week up to 93 and by month beyond', () => {
    expect(granularityOf({ from: '2026-10-01', to: '2026-10-31' })).toBe('day');
    expect(granularityOf({ from: '2026-10-01', to: '2026-11-01' })).toBe('week');
    expect(granularityOf({ from: '2026-07-01', to: '2026-09-30' })).toBe('week');
    expect(granularityOf({ from: '2026-01-01', to: '2026-12-31' })).toBe('month');
  });
});

describe('bucketsOf', () => {
  it('should give one column per day for a week', () => {
    const buckets = bucketsOf({ from: '2026-10-26', to: '2026-11-01' });

    expect(buckets).toHaveLength(7);
    expect(buckets[0]).toEqual({ from: '2026-10-26', to: '2026-10-26', granularity: 'day' });
    expect(buckets[6]).toEqual({ from: '2026-11-01', to: '2026-11-01', granularity: 'day' });
  });

  it('should give a single column for one day', () => {
    expect(bucketsOf({ from: '2026-10-28', to: '2026-10-28' })).toHaveLength(1);
  });

  it('should cut weeks at Sunday and clip the first and the last one to the period', () => {
    const buckets = bucketsOf({ from: '2026-09-02', to: '2026-10-14' });

    expect(buckets[0]).toEqual({ from: '2026-09-02', to: '2026-09-06', granularity: 'week' });
    expect(buckets[1]).toEqual({ from: '2026-09-07', to: '2026-09-13', granularity: 'week' });
    expect(buckets.at(-1)).toEqual({ from: '2026-10-12', to: '2026-10-14', granularity: 'week' });
  });

  it('should give twelve calendar months for a year, together covering it without a gap or an overlap', () => {
    const buckets = bucketsOf({ from: '2026-01-01', to: '2026-12-31' });

    expect(buckets).toHaveLength(12);
    expect(buckets[1]).toEqual({ from: '2026-02-01', to: '2026-02-28', granularity: 'month' });
    buckets.slice(1).forEach((bucket, index) => expect(bucket.from > (buckets[index] as { to: string }).to).toBe(true));
  });
});
