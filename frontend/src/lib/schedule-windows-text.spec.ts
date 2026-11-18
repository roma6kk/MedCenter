import { describeWindows, type WeekDay, type WeeklyWindow } from './schedule-windows-text';

const SHORT: Readonly<Record<WeekDay, string>> = { MO: 'Пн', TU: 'Вт', WE: 'Ср', TH: 'Чт', FR: 'Пт', SA: 'Сб', SU: 'Вс' };
const label = (day: WeekDay): string => SHORT[day];

function windows(days: ReadonlyArray<WeekDay>, startTime: string, endTime: string): ReadonlyArray<WeeklyWindow> {
  return days.map((dayOfWeek) => ({ dayOfWeek, startTime, endTime }));
}

describe('describeWindows', () => {
  it('should write a working week as one range', () => {
    expect(describeWindows(windows(['MO', 'TU', 'WE', 'TH', 'FR'], '09:00', '13:00'), label)).toEqual([{ days: 'Пн–Пт', times: '09:00–13:00' }]);
  });

  it('should list days that do not follow each other and write two neighbours as a pair', () => {
    expect(describeWindows(windows(['MO', 'WE', 'FR'], '09:00', '13:00'), label)[0]?.days).toBe('Пн, Ср, Пт');
    expect(describeWindows(windows(['SA', 'SU'], '10:00', '12:00'), label)[0]?.days).toBe('Сб, Вс');
  });

  it('should put the windows of one day on one line in time order', () => {
    const input = [...windows(['MO'], '14:00', '17:00'), ...windows(['MO'], '09:00', '13:00')];

    expect(describeWindows(input, label)).toEqual([{ days: 'Пн', times: '09:00–13:00, 14:00–17:00' }]);
  });

  it('should make a group for each distinct set of windows, the earlier day first', () => {
    const input = [...windows(['SA'], '10:00', '12:00'), ...windows(['MO', 'TU', 'WE'], '09:00', '13:00')];

    expect(describeWindows(input, label)).toEqual([
      { days: 'Пн–Ср', times: '09:00–13:00' },
      { days: 'Сб', times: '10:00–12:00' },
    ]);
  });

  it('should say nothing for a schedule without windows', () => {
    expect(describeWindows([], label)).toEqual([]);
  });
});
