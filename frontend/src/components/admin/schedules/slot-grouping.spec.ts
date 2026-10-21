import { countSlots, mayBeTruncated, SLOT_PAGE_LIMIT } from './slot-grouping';
import type { ScheduleSlot } from './schedule-types';

function slot(id: string, start: string, status: ScheduleSlot['status'] = 'free'): ScheduleSlot {
  return { id, scheduleId: 's1', start, end: start, status };
}

describe('countSlots', () => {
  it('should count each status and the total when the slots are mixed', () => {
    const counts = countSlots([slot('1', '2026-10-18T07:00:00Z'), slot('2', '2026-10-18T08:00:00Z', 'busy'), slot('3', '2026-10-18T09:00:00Z', 'entered-in-error'), slot('4', '2026-10-18T10:00:00Z')]);

    expect(counts).toEqual({ free: 2, busy: 1, 'entered-in-error': 1, total: 4 });
  });
});

describe('mayBeTruncated', () => {
  const slotsOf = (count: number): ReadonlyArray<ScheduleSlot> => Array.from({ length: count }, (_, index) => slot(String(index), '2026-10-18T07:00:00Z'));

  it('should trust an answer when it is shorter than the server page', () => {
    expect(mayBeTruncated(slotsOf(SLOT_PAGE_LIMIT - 1))).toBe(false);
  });

  it('should doubt an answer when it is exactly as long as the server page', () => {
    expect(mayBeTruncated(slotsOf(SLOT_PAGE_LIMIT))).toBe(true);
  });

  it('should trust an answer when it is empty', () => {
    expect(mayBeTruncated([])).toBe(false);
  });
});
