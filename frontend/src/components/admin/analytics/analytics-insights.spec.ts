import { cancellationInsight, headlineOf, noshowInsight, specialtyInsight } from './analytics-insights';
import type { AppointmentsReport, MeasureReport } from './analytics-types';

const period = { start: '2026-01-01T00:00:00.000Z', end: '2026-12-31T23:59:59.999Z' };

function appointments(booked: number, cancelled: number, noshow: number, fulfilled = 0): AppointmentsReport {
  return {
    measure: 'appointments-by-status',
    scoring: 'cohort',
    period,
    total: booked + fulfilled + cancelled + noshow,
    groups: [{ code: 'booked', count: booked }, { code: 'fulfilled', count: fulfilled }, { code: 'cancelled', count: cancelled }, { code: 'noshow', count: noshow }],
  };
}

function encounters(groups: MeasureReport['groups']): MeasureReport {
  return { measure: 'encounters-by-specialty', scoring: 'cohort', period, total: groups.reduce((sum, group) => sum + group.count, 0), groups };
}

describe('headlineOf', () => {
  it('should say that more than half is cancelled when cancellations are the majority', () => {
    expect(headlineOf(appointments(34, 62, 21))).toBe('cancelledMajority');
  });

  it('should name the leading status when it is not a majority', () => {
    expect(headlineOf(appointments(10, 12, 10))).toBe('cancelledTop');
    expect(headlineOf(appointments(10, 3, 12))).toBe('noshowTop');
    expect(headlineOf(appointments(12, 3, 4))).toBe('bookedTop');
  });

  it('should name the attended visits when they lead', () => {
    expect(headlineOf(appointments(3, 2, 1, 9))).toBe('fulfilledTop');
  });

  it('should call the split even when the top count is shared', () => {
    expect(headlineOf(appointments(5, 5, 1))).toBe('balanced');
  });

  it('should give no finding when there are no appointments', () => {
    expect(headlineOf(appointments(0, 0, 0))).toBe('none');
  });
});

describe('cancellationInsight', () => {
  it('should compare the cancellations with booked and no-shows together when they outnumber both', () => {
    expect(cancellationInsight(appointments(34, 62, 21))).toMatchObject({ count: 62, total: 117, percent: 53, comparison: 'overOthers' });
  });

  it('should count the attended visits among the other statuses when the cancellations are compared', () => {
    expect(cancellationInsight(appointments(10, 15, 10, 20))).toMatchObject({ comparison: 'other' });
  });

  it('should compare with each status when they lead each one but not both together', () => {
    expect(cancellationInsight(appointments(10, 15, 10))).toMatchObject({ comparison: 'overEach' });
  });

  it('should fall back to the plain counts when the cancellations do not lead', () => {
    expect(cancellationInsight(appointments(20, 5, 3))).toMatchObject({ comparison: 'other', booked: 20, noshow: 3 });
  });

  it('should return nothing when nothing was cancelled', () => {
    expect(cancellationInsight(appointments(4, 0, 1))).toBeNull();
    expect(cancellationInsight(appointments(0, 0, 0))).toBeNull();
  });
});

describe('noshowInsight', () => {
  it('should return the count and its share when there are no-shows', () => {
    expect(noshowInsight(appointments(34, 62, 21))).toEqual({ count: 21, percent: 18 });
  });

  it('should return nothing without no-shows', () => {
    expect(noshowInsight(appointments(4, 2, 0))).toBeNull();
  });
});

describe('specialtyInsight', () => {
  it('should name the leading specialty with its share', () => {
    const report = encounters([{ code: 'a', display: 'Кардиология', count: 1 }, { code: 'b', display: 'Терапия', count: 29 }]);
    expect(specialtyInsight(report)).toEqual({ name: 'Терапия', count: 29, total: 30, percent: 97, only: false });
  });

  it('should mark a single specialty as the only one', () => {
    expect(specialtyInsight(encounters([{ code: 'b', display: 'Терапия', count: 2 }]))?.only).toBe(true);
  });

  it('should return nothing without encounters or without a named specialty', () => {
    expect(specialtyInsight(encounters([]))).toBeNull();
    expect(specialtyInsight(encounters([{ code: 'x', count: 3 }]))).toBeNull();
  });
});
