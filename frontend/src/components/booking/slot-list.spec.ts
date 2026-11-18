import type { Slot } from '@/components/catalog/catalog-types';
import { isSelectable, nearestFreeSlots, slotsForService, withTakenSlot } from './slot-list';

function slot(id: string, minutes: number, status: Slot['status'] = 'free'): Slot {
  const start = Date.parse('2026-10-19T11:00:00.000Z');
  return { id, start: new Date(start).toISOString(), end: new Date(start + minutes * 60_000).toISOString(), status };
}

describe('slotsForService', () => {
  const slots = [slot('a', 20), slot('b', 30), slot('c', 20)];

  it('should keep only the slots as long as the service when a duration is given', () => {
    expect(slotsForService(slots, 20).map((item) => item.id)).toEqual(['a', 'c']);
  });

  it('should keep every slot when no service is chosen', () => {
    expect(slotsForService(slots, null)).toHaveLength(3);
  });

  it('should return nothing when no slot has the length of the service', () => {
    expect(slotsForService(slots, 40)).toEqual([]);
  });

  it('should tell two services of the same length apart by the service of the schedule', () => {
    const two: ReadonlyArray<Slot> = [{ ...slot('a', 30), serviceId: 'svc-1' }, { ...slot('b', 30), serviceId: 'svc-2' }, slot('old', 30)];
    expect(slotsForService(two, 30, 'svc-2').map((item) => item.id)).toEqual(['b', 'old']);
    expect(nearestFreeSlots(two, 30, 5, 'svc-1').map((item) => item.id)).toEqual(['a', 'old']);
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

describe('nearestFreeSlots', () => {
  function at(id: string, hour: number, minutes: number, status: Slot['status'] = 'free'): Slot {
    const start = Date.parse('2026-10-19T00:00:00.000Z') + hour * 3_600_000;
    return { id, start: new Date(start).toISOString(), end: new Date(start + minutes * 60_000).toISOString(), status };
  }

  it('should return the earliest free slots first when the list is not sorted', () => {
    const slots = [at('c', 9, 30), at('a', 6, 30), at('d', 10, 30), at('b', 7, 30)];

    expect(nearestFreeSlots(slots, null, 3).map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('should skip slots that are not free when some are busy', () => {
    const slots = [at('a', 6, 30, 'busy'), at('b', 7, 30)];

    expect(nearestFreeSlots(slots, null, 3).map((item) => item.id)).toEqual(['b']);
  });

  it('should keep only slots as long as the service when a duration is given', () => {
    const slots = [at('a', 6, 20), at('b', 7, 30)];

    expect(nearestFreeSlots(slots, 30, 3).map((item) => item.id)).toEqual(['b']);
  });

  it('should return nothing when the doctor has no free slot', () => {
    expect(nearestFreeSlots([], null, 3)).toEqual([]);
  });
});
