import { currentYearRange, DEFAULT_AUDIT_DAYS, lastDaysRange, validateReportRange } from './report-range';

describe('validateReportRange', () => {
  it('should accept a one-day period when from equals to', () => {
    expect(validateReportRange({ from: '2026-10-16', to: '2026-10-16' })).toBeNull();
  });

  it('should accept the period when it is exactly 366 calendar days of a leap year', () => {
    expect(validateReportRange({ from: '2028-01-01', to: '2028-12-31' })).toBeNull();
  });

  it('should refuse a period with the span reason when it is 367 days', () => {
    expect(validateReportRange({ from: '2028-01-01', to: '2029-01-01' })).toBe('span');
  });

  it('should refuse a period with the order reason when it ends before it starts', () => {
    expect(validateReportRange({ from: '2026-10-16', to: '2026-10-15' })).toBe('order');
  });

  it.each([
    ['empty from', { from: '', to: '2026-10-16' }],
    ['empty to', { from: '2026-10-16', to: '' }],
    ['impossible day', { from: '2026-02-30', to: '2026-03-01' }],
  ])('should refuse the period with the invalid reason when it has %s', (_name, range) => {
    expect(validateReportRange(range)).toBe('invalid');
  });
});

describe('default ranges', () => {
  it('should cover the whole clinic year when the dashboard opens', () => {
    expect(currentYearRange('2026-10-16')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(validateReportRange(currentYearRange('2028-02-29'))).toBeNull();
  });

  it('should end on today and span the audit default window when the journal opens', () => {
    const range = lastDaysRange(DEFAULT_AUDIT_DAYS, '2026-10-16');

    expect(range).toEqual({ from: '2026-09-17', to: '2026-10-16' });
    expect(validateReportRange(range)).toBeNull();
  });
});
