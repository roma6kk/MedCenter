import { rankGroups, sharePercent, statusCount, statusCounts } from './analytics-math';
import type { AppointmentsReport } from './analytics-types';

const period = { start: '2026-01-01T00:00:00.000Z', end: '2026-12-31T23:59:59.999Z' };

describe('sharePercent', () => {
  it('should round to a whole percent when the share is fractional', () => {
    expect(sharePercent(1, 3)).toBe(33);
    expect(sharePercent(2, 3)).toBe(67);
  });

  it('should return 0 when the total or the count is empty', () => {
    expect(sharePercent(5, 0)).toBe(0);
    expect(sharePercent(0, 10)).toBe(0);
  });

  it('should never exceed 100 when the count is above the total', () => {
    expect(sharePercent(11, 10)).toBe(100);
  });
});

describe('statusCount', () => {
  const report: AppointmentsReport = {
    measure: 'appointments-by-status',
    scoring: 'cohort',
    period,
    total: 5,
    groups: [{ code: 'booked', count: 3 }],
    cancelled: 2,
  };

  it('should read a status from groups first and from the flat counter second when both are present', () => {
    expect(statusCount(report, 'booked')).toBe(3);
    expect(statusCount(report, 'cancelled')).toBe(2);
  });

  it('should read the attended visits from the fulfilled group when the report has one', () => {
    const withAttended: AppointmentsReport = { ...report, total: 9, groups: [...report.groups, { code: 'fulfilled', count: 4 }] };

    expect(statusCount(withAttended, 'fulfilled')).toBe(4);
    expect(statusCount({ ...report, fulfilled: 4 }, 'fulfilled')).toBe(4);
  });

  it('should report 0 for a status when neither groups nor the flat counters know it', () => {
    expect(statusCounts(report)).toEqual({ booked: 3, fulfilled: 0, cancelled: 2, noshow: 0 });
  });
});

describe('rankGroups', () => {
  it('should put the biggest group first and break ties by name when the groups are ranked', () => {
    const ranked = rankGroups([
      { code: 'b', display: 'Бета', count: 2 },
      { code: 'a', display: 'Альфа', count: 2 },
      { code: 'c', display: 'Гамма', count: 9 },
    ]);

    expect(ranked.map((group) => group.code)).toEqual(['c', 'a', 'b']);
  });
});
