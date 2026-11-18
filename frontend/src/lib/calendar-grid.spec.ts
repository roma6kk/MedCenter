import { addMonths, clampKey, formatTypedDate, monthGrid, parseTypedDate, weekdayIndex } from './calendar-grid';

describe('parseTypedDate', () => {
  it.each([
    ['2026-10-27', '2026-10-27'],
    ['27.10.2026', '2026-10-27'],
    ['7.1.2026', '2026-01-07'],
    ['07/01/2026', '2026-01-07'],
    [' 27-10-2026 ', '2026-10-27'],
  ])('should read %s as the day %s when it is a real date', (text, key) => {
    expect(parseTypedDate(text)).toBe(key);
  });

  it.each(['', '27.10', '31.02.2026', '2026-02-30', '27.10.26', 'abc', '0.0.2026'])('should refuse %j when it is not a real day', (text) => {
    expect(parseTypedDate(text)).toBeNull();
  });
});

describe('formatTypedDate', () => {
  it('should write a key day-first with dots when the key is a real day', () => {
    expect(formatTypedDate('2026-10-27')).toBe('27.10.2026');
  });

  it('should return empty text as it was when there is no day yet', () => {
    expect(formatTypedDate('')).toBe('');
  });
});

describe('addMonths', () => {
  it('should clamp to the last day of a shorter month when the day does not exist there', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
  });

  it('should cross the year boundary in both directions', () => {
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonths('2026-01-15', -13)).toBe('2024-12-15');
  });
});

describe('weekdayIndex', () => {
  it('should count Monday as 0 and Sunday as 6', () => {
    expect(weekdayIndex('2026-10-26')).toBe(0);
    expect(weekdayIndex('2026-11-01')).toBe(6);
  });
});

describe('clampKey', () => {
  it('should keep the day inside the bounds when one of them is crossed', () => {
    expect(clampKey('2026-01-01', '2026-02-01', '2026-03-01')).toBe('2026-02-01');
    expect(clampKey('2026-05-01', '2026-02-01', '2026-03-01')).toBe('2026-03-01');
    expect(clampKey('2026-02-10', '2026-02-01', '2026-03-01')).toBe('2026-02-10');
  });

  it('should ignore a missing bound when only one is given', () => {
    expect(clampKey('2026-05-01', undefined, undefined)).toBe('2026-05-01');
  });
});

describe('monthGrid', () => {
  it('should give six Monday-first weeks that start on the Monday on or before the 1st', () => {
    const grid = monthGrid('2026-10-15');

    expect(grid).toHaveLength(6);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(grid[0]![0]!.key).toBe('2026-09-28');
    expect(grid[0]![3]).toEqual({ key: '2026-10-01', inMonth: true });
    expect(grid[0]![0]!.inMonth).toBe(false);
  });

  it('should mark exactly the days of the month as in-month', () => {
    const inMonth = monthGrid('2026-02-10').flat().filter((cell) => cell.inMonth);

    expect(inMonth).toHaveLength(28);
  });
});
