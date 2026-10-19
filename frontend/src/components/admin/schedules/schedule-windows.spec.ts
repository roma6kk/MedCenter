import { findOverlappingWindows, isWindowValid, MAX_HORIZON_DAYS, sortWindows, toMinutes, windowsOfDay } from './schedule-windows';
import type { WeeklyWindow } from './schedule-types';

const mo = (startTime: string, endTime: string): WeeklyWindow => ({ dayOfWeek: 'MO', startTime, endTime });
const tu = (startTime: string, endTime: string): WeeklyWindow => ({ dayOfWeek: 'TU', startTime, endTime });

describe('isWindowValid', () => {
  it('should accept a window when it ends after it starts', () => {
    expect(isWindowValid(mo('09:00', '13:00'))).toBe(true);
  });

  it.each([['13:00', '09:00'], ['09:00', '09:00'], ['9:00', '13:00'], ['09:00', '24:00'], ['09:60', '13:00'], ['', '13:00']])(
    'should refuse the window %s – %s when its times are checked',
    (start, end) => {
      expect(isWindowValid(mo(start, end))).toBe(false);
    },
  );
});

describe('findOverlappingWindows', () => {
  it('should report both windows when a pair overlaps', () => {
    expect([...findOverlappingWindows([mo('09:00', '13:00'), mo('12:00', '15:00')])]).toEqual([0, 1]);
  });

  it('should not report windows when they only touch', () => {
    expect(findOverlappingWindows([mo('09:00', '13:00'), mo('13:00', '15:00')]).size).toBe(0);
  });

  it('should not report the same hours when they are on different weekdays', () => {
    expect(findOverlappingWindows([mo('09:00', '13:00'), tu('09:00', '13:00')]).size).toBe(0);
  });

  it('should skip a window when its times cannot be read', () => {
    expect(findOverlappingWindows([mo('09:00', '13:00'), mo('', '15:00')]).size).toBe(0);
  });

  it('should report only the windows that cross another one when the list is mixed', () => {
    expect([...findOverlappingWindows([mo('08:00', '09:00'), mo('10:00', '12:00'), mo('11:00', '13:00')])]).toEqual([1, 2]);
  });
});

describe('sortWindows and windowsOfDay', () => {
  it('should order by weekday then by start time when the windows are sorted, without touching the input', () => {
    const input = [tu('09:00', '10:00'), mo('14:00', '15:00'), mo('09:00', '10:00')];

    expect(sortWindows(input).map((w) => `${w.dayOfWeek}${w.startTime}`)).toEqual(['MO09:00', 'MO14:00', 'TU09:00']);
    expect(input[0]?.dayOfWeek).toBe('TU');
  });

  it('should list the windows of one weekday in start order when they are grouped', () => {
    expect(windowsOfDay([mo('14:00', '15:00'), tu('08:00', '09:00'), mo('09:00', '10:00')], 'MO').map((w) => w.startTime)).toEqual(['09:00', '14:00']);
  });
});

describe('time helpers', () => {
  it('should convert HH:mm to minutes when a time is read', () => {
    expect(toMinutes('01:30')).toBe(90);
  });

  it('should keep the planning horizon at 90 days when the limit is read', () => {
    expect(MAX_HORIZON_DAYS).toBe(90);
  });
});
