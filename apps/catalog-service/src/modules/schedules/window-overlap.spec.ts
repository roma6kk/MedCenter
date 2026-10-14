import type { WeeklyWindowDto } from './dto/create-schedule.dto';
import { hasCrossOverlap, hasInternalOverlap, windowsIntersect } from './window-overlap';

const window = (dayOfWeek: WeeklyWindowDto['dayOfWeek'], startTime: string, endTime: string): WeeklyWindowDto => ({
  dayOfWeek,
  startTime,
  endTime,
});

describe('window overlap', () => {
  it('should intersect when two windows of the same weekday share minutes', () => {
    expect(windowsIntersect(window('MO', '09:00', '12:00'), window('MO', '11:00', '13:00'))).toBe(true);
  });

  it('should not intersect when one window ends exactly where the next starts', () => {
    expect(windowsIntersect(window('MO', '09:00', '12:00'), window('MO', '12:00', '13:00'))).toBe(false);
  });

  it('should not intersect when the weekdays differ', () => {
    expect(windowsIntersect(window('MO', '09:00', '12:00'), window('TU', '09:00', '12:00'))).toBe(false);
  });

  it('should detect an overlap inside one list when two of its windows intersect', () => {
    expect(hasInternalOverlap([window('MO', '09:00', '12:00'), window('TU', '09:00', '10:00'), window('MO', '11:00', '13:00')])).toBe(true);
    expect(hasInternalOverlap([window('MO', '09:00', '12:00'), window('MO', '12:00', '13:00')])).toBe(false);
  });

  it('should detect an overlap across schedules when a candidate window meets an existing one', () => {
    expect(hasCrossOverlap([window('MO', '09:00', '10:00')], [window('MO', '09:30', '11:00')])).toBe(true);
    expect(hasCrossOverlap([window('MO', '09:00', '10:00')], [window('TU', '09:00', '10:00')])).toBe(false);
  });
});
