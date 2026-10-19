import { countSlots, groupSlotsByDay, mayBeTruncated, SLOT_PAGE_LIMIT } from './slot-grouping';
import type { ScheduleSlot } from './schedule-types';

function slot(id: string, start: string, status: ScheduleSlot['status'] = 'free'): ScheduleSlot {
  return { id, scheduleId: 's1', start, end: start, status };
}

describe('groupSlotsByDay', () => {
  it('should group by clinic day in ascending order with the slots of a day by start time when the slots are unordered', () => {
    const days = groupSlotsByDay([slot('c', '2026-10-25T07:00:00Z'), slot('b', '2026-10-18T08:00:00Z'), slot('a', '2026-10-18T07:00:00Z')]);

    expect(days.map((d) => d.day)).toEqual(['2026-10-18', '2026-10-25']);
    expect(days[0]?.slots.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('should put a late evening UTC slot on the next clinic day when the clinic zone is ahead', () => {
    const days = groupSlotsByDay([slot('late', '2026-10-17T22:30:00Z')]);

    expect(days[0]?.day).toBe('2026-10-18');
  });

  it('should return nothing when there are no slots', () => {
    expect(groupSlotsByDay([])).toEqual([]);
  });
});

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
