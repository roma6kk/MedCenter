import { appointment } from './doctor-test-utils';
import type { ScheduleSlot } from './doctor-types';
import { buildWeekCalendar, loadPercent, minutesLabel, weekDaysOf, weekStartOf } from './schedule-week-model';

function slot(id: string, start: string, status: ScheduleSlot['status'] = 'free'): ScheduleSlot {
  return { id, scheduleId: 'sch-1', start, end: start, status, label: id };
}

// 2026-10-28 is a Wednesday; clinic time is UTC+3, so 06:00Z is 09:00.
describe('weekStartOf and weekDaysOf', () => {
  it('should start the week on Monday', () => {
    expect(weekStartOf('2026-10-28')).toBe('2026-10-26');
    expect(weekStartOf('2026-10-26')).toBe('2026-10-26');
    expect(weekStartOf('2026-11-01')).toBe('2026-10-26');
  });

  it('should list seven days across a month border', () => {
    expect(weekDaysOf('2026-10-26')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  });
});

describe('buildWeekCalendar', () => {
  const days = weekDaysOf('2026-10-26');

  it('should put a slot on its clinic day and count the busy ones', () => {
    const calendar = buildWeekCalendar(days, [slot('a', '2026-10-28T06:00:00Z'), slot('b', '2026-10-28T06:30:00Z', 'busy'), slot('c', '2026-10-29T06:00:00Z')], []);

    const wednesday = calendar.days.find((day) => day.dateKey === '2026-10-28');
    expect(wednesday).toMatchObject({ busy: 1, total: 2 });
    expect(calendar.days.find((day) => day.dateKey === '2026-10-29')).toMatchObject({ busy: 0, total: 1 });
    expect(calendar.days.find((day) => day.dateKey === '2026-10-30')).toMatchObject({ busy: 0, total: 0 });
  });

  it('should use the clinic zone for the day: 22:30Z is already the next morning in Minsk', () => {
    const calendar = buildWeekCalendar(days, [slot('late', '2026-10-27T22:30:00Z')], []);

    expect(calendar.days.find((day) => day.dateKey === '2026-10-28')?.total).toBe(1);
  });

  it('should attach the visit of a busy slot by its slot id', () => {
    const visit = appointment({ id: 'v1', slotId: 'b', patientId: 'p9', patientName: 'Кузнецов Павел' });

    const calendar = buildWeekCalendar(days, [slot('b', '2026-10-28T06:30:00Z', 'busy')], [visit]);

    expect(calendar.days[2]?.cells[0]?.visit?.id).toBe('v1');
  });

  it('should not attach a cancelled visit and leave a busy slot the journal does not know without one', () => {
    const cancelled = appointment({ id: 'v1', slotId: 'b', status: 'cancelled' });

    const calendar = buildWeekCalendar(days, [slot('b', '2026-10-28T06:30:00Z', 'busy'), slot('x', '2026-10-28T07:00:00Z', 'busy')], [cancelled]);

    expect(calendar.days[2]?.cells.map((cell) => cell.visit)).toEqual([undefined, undefined]);
  });

  it('should skip a slot entered in error and a slot outside the week', () => {
    const calendar = buildWeekCalendar(days, [slot('e', '2026-10-28T06:00:00Z', 'entered-in-error'), slot('o', '2026-11-02T06:00:00Z')], []);

    expect(calendar.days.every((day) => day.total === 0)).toBe(true);
    expect(calendar.rows).toEqual([]);
  });

  it('should give one grid row for each distinct start time of the week, ascending', () => {
    const calendar = buildWeekCalendar(days, [slot('a', '2026-10-28T06:30:00Z'), slot('b', '2026-10-29T06:00:00Z'), slot('c', '2026-10-29T06:30:00Z')], []);

    expect(calendar.rows).toEqual([540, 570]);
  });
});

describe('minutesLabel and loadPercent', () => {
  it('should write minutes as HH:MM', () => {
    expect(minutesLabel(545)).toBe('09:05');
    expect(minutesLabel(840)).toBe('14:00');
  });

  it('should give the share of busy slots and zero for an empty day', () => {
    expect(loadPercent({ busy: 1, total: 4 })).toBe(25);
    expect(loadPercent({ busy: 0, total: 0 })).toBe(0);
  });
});
