import type { Slot } from '@/components/catalog/catalog-types';
import { isSelectable, slotsForDuration, withTakenSlot } from './slot-list';

function slot(id: string, minutes: number, status: Slot['status'] = 'free'): Slot {
  const start = Date.parse('2026-10-19T11:00:00.000Z');
  return { id, start: new Date(start).toISOString(), end: new Date(start + minutes * 60_000).toISOString(), status };
}

describe('slotsForDuration', () => {
  const slots = [slot('a', 20), slot('b', 30), slot('c', 20)];

  it('should keep only the slots as long as the service when a duration is given', () => {
    expect(slotsForDuration(slots, 20).map((item) => item.id)).toEqual(['a', 'c']);
  });

  it('should keep every slot when no service is chosen', () => {
    expect(slotsForDuration(slots, null)).toHaveLength(3);
  });

  it('should return nothing when no slot has the length of the service', () => {
    expect(slotsForDuration(slots, 40)).toEqual([]);
  });
});

describe('withTakenSlot', () => {
  it('should leave the list alone when nothing was taken', () => {
    const slots = [slot('a', 30)];

    expect(withTakenSlot(slots, null)).toBe(slots);
  });

  it('should mark the slot as busy when the server refused it and it is still listed', () => {
    const result = withTakenSlot([slot('a', 30), slot('b', 30)], slot('a', 30));

    expect(result.map((item) => item.status)).toEqual(['busy', 'free']);
  });

  it('should add the taken slot back when the refetch has dropped it', () => {
    const result = withTakenSlot([slot('b', 30)], slot('a', 30));

    expect(result.map((item) => `${item.id}:${item.status}`)).toEqual(['b:free', 'a:busy']);
  });
});

describe('isSelectable', () => {
  it('should allow a slot to be chosen only when it is free', () => {
    expect(isSelectable(slot('a', 30, 'free'))).toBe(true);
    expect(isSelectable(slot('a', 30, 'busy'))).toBe(false);
    expect(isSelectable(slot('a', 30, 'entered-in-error'))).toBe(false);
  });
});
