import { durationParts, elapsedMinutes } from './encounter-duration';

describe('encounter duration', () => {
  const START = '2026-10-26T10:00:00.000Z';

  it('should count whole minutes since the start', () => {
    expect(elapsedMinutes(START, Date.parse('2026-10-26T10:23:59.000Z'))).toBe(23);
  });

  it('should not go negative when the start is ahead of the clock', () => {
    expect(elapsedMinutes(START, Date.parse('2026-10-26T09:59:00.000Z'))).toBe(0);
  });

  it('should read an unparsable start as zero', () => {
    expect(elapsedMinutes('not a date', Date.now())).toBe(0);
  });

  it('should split the minutes into minutes, hours or days', () => {
    expect(durationParts(23)).toEqual({ kind: 'minutes', days: 0, hours: 0, minutes: 23 });
    expect(durationParts(65)).toEqual({ kind: 'hours', days: 0, hours: 1, minutes: 5 });
    expect(durationParts(1440 + 180 + 7)).toEqual({ kind: 'days', days: 1, hours: 3, minutes: 7 });
  });
});
