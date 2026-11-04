/**
 * slot-list — what the slot picker shows out of the list the API returned: slots for the chosen service only, and
 * the slot another patient has just taken (it must not silently vanish from under the user, BR-001).
 */
import type { Slot } from '@/components/catalog/catalog-types';
import { slotDurationMin } from './slot-time';

/**
 * The slots of the chosen service. A schedule belongs to one service, and the slot search names it (`serviceId`), so two
 * services of the same length stay apart. A slot of an older answer without it falls back to the length of the service
 * (its slots are as long as the default duration); the server still refuses a wrong pair (400).
 */
export function slotsForService(slots: ReadonlyArray<Slot>, durationMin: number | null, serviceId: string | null = null): ReadonlyArray<Slot> {
  if (durationMin === null && serviceId === null) return slots;
  return slots.filter((slot) => {
    if (serviceId !== null && slot.serviceId !== undefined) return slot.serviceId === serviceId;
    return durationMin === null || slotDurationMin(slot) === durationMin;
  });
}

/** The slot the server refused is shown as taken: marked `busy` in the list, or added when the refetch has dropped it. */
export function withTakenSlot(slots: ReadonlyArray<Slot>, taken: Slot | null): ReadonlyArray<Slot> {
  if (taken === null) return slots;
  const busy: Slot = { ...taken, status: 'busy' };
  return slots.some((slot) => slot.id === taken.id) ? slots.map((slot) => (slot.id === taken.id ? busy : slot)) : [...slots, busy];
}

export function isSelectable(slot: Slot): boolean {
  return slot.status === 'free';
}

/** The `limit` earliest free slots of the list (as long as the service when one is chosen): what a doctor card offers as "nearest". */
export function nearestFreeSlots(slots: ReadonlyArray<Slot>, durationMin: number | null, limit: number, serviceId: string | null = null): ReadonlyArray<Slot> {
  return slotsForService(slots, durationMin, serviceId)
    .filter(isSelectable)
    .map((slot) => ({ slot, startMs: Date.parse(slot.start) }))
    .sort((a, b) => a.startMs - b.startMs)
    .slice(0, limit)
    .map(({ slot }) => slot);
}
