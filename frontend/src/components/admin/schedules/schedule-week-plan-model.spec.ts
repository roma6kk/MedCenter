import { buildWeekPlan } from './schedule-week-plan-model';
import type { AdminSchedule } from './schedule-types';

const NAMES = {
  doctor: (id: string | undefined) => ({ d1: 'Иванова Мария', d2: 'Петров Сергей' })[id ?? ''] ?? '—',
  room: (id: string | undefined) => ({ r1: 'Кабинет 101', r2: 'Кабинет 112' })[id ?? ''] ?? '—',
};

const SCHEDULES: ReadonlyArray<AdminSchedule> = [
  { id: 's1', isActive: true, practitionerRoleId: 'd1', roomId: 'r1', windows: [{ dayOfWeek: 'MO', startTime: '14:00', endTime: '17:00' }, { dayOfWeek: 'MO', startTime: '09:00', endTime: '13:00' }] },
  { id: 's2', isActive: true, practitionerRoleId: 'd1', roomId: 'r2', windows: [{ dayOfWeek: 'WE', startTime: '09:00', endTime: '13:00' }] },
  { id: 's3', isActive: true, practitionerRoleId: 'd2', roomId: 'r1', windows: [{ dayOfWeek: 'MO', startTime: '09:00', endTime: '13:00' }] },
];

describe('buildWeekPlan', () => {
  it('should make a row per doctor with the windows of each weekday, earliest first, and the room of each', () => {
    const rows = buildWeekPlan(SCHEDULES, 'doctor', NAMES);

    expect(rows.map((row) => row.label)).toEqual(['Иванова Мария', 'Петров Сергей']);
    expect(rows[0]?.days.MO).toEqual([
      { times: '09:00–13:00', where: 'Кабинет 101' },
      { times: '14:00–17:00', where: 'Кабинет 101' },
    ]);
    expect(rows[0]?.days.WE).toEqual([{ times: '09:00–13:00', where: 'Кабинет 112' }]);
    expect(rows[0]?.days.TU).toEqual([]);
  });

  it('should make a row per room with the doctor in each window, so a room used by two doctors shows both', () => {
    const rows = buildWeekPlan(SCHEDULES, 'room', NAMES);

    expect(rows.map((row) => row.label)).toEqual(['Кабинет 101', 'Кабинет 112']);
    expect(rows[0]?.days.MO.map((entry) => `${entry.times} ${entry.where}`)).toEqual(['09:00–13:00 Иванова Мария', '09:00–13:00 Петров Сергей', '14:00–17:00 Иванова Мария']);
  });

  it('should show a window of two identical schedules once and give a schedule without a room a row of its own', () => {
    const twin: AdminSchedule = { ...(SCHEDULES[1] as AdminSchedule), id: 's4' };
    const noRoom: AdminSchedule = { id: 's5', isActive: true, practitionerRoleId: 'd2', windows: [] };

    expect(buildWeekPlan([...SCHEDULES, twin], 'doctor', NAMES)[0]?.days.WE).toHaveLength(1);
    expect(buildWeekPlan([noRoom], 'room', NAMES)).toEqual([expect.objectContaining({ key: '', label: '—' })]);
  });
});
