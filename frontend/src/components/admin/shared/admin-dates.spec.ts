import { addDays, clinicDayOf, clinicTimeOf, daysBetween, formatClinicDateTime, formatDateKey, formatDayHeading, todayKey } from './admin-dates';

describe('admin-dates', () => {
  it('should add days across a month and a leap day without drifting when days are added', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('should count whole days between two keys and go negative when the order is reversed', () => {
    expect(daysBetween('2026-10-01', '2026-10-16')).toBe(15);
    expect(daysBetween('2026-10-16', '2026-10-01')).toBe(-15);
    expect(daysBetween('nope', '2026-10-01')).toBeNaN();
  });

  it('should format a day key as dd.mm.yyyy and a heading with the weekday when a day is shown', () => {
    expect(formatDateKey('2026-10-16')).toBe('16.10.2026');
    expect(formatDayHeading('2026-10-20')).toContain('20.10.2026');
  });

  it('should read the clinic day of an instant in Europe/Minsk, not in UTC, when the instant is near midnight', () => {
    expect(clinicDayOf('2026-10-15T22:30:00.000Z')).toBe('2026-10-16');
    expect(clinicTimeOf('2026-10-15T22:30:00.000Z')).toBe('01:30');
  });

  it('should take today in the clinic zone when the instant is near midnight', () => {
    expect(todayKey(new Date('2026-10-15T22:30:00.000Z'))).toBe('2026-10-16');
  });

  it('should name the weekday in the language of the interface when the heading is formatted', () => {
    expect(formatDayHeading('2026-10-20', 'ru')).toMatch(/^вт/);
    expect(formatDayHeading('2026-10-20', 'en')).toMatch(/^Tue/);
  });

  it('should format an instant in the clinic zone and in the language of the interface when the date and time are shown', () => {
    expect(formatClinicDateTime('2026-10-15T22:30:00.000Z', 'ru')).toContain('окт');
    expect(formatClinicDateTime('2026-10-15T22:30:00.000Z', 'en')).toContain('Oct');
    expect(formatClinicDateTime('2026-10-15T22:30:00.000Z', 'en')).toContain('01:30');
  });
});
