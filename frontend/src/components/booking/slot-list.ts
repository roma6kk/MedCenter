/**
 * slot-list — what the slot picker shows out of the list the API returned: slots for the chosen service only, and
 * the slot another patient has just taken (it must not silently vanish from under the user, BR-001).
 */
import type { Slot } from '@/components/catalog/catalog-types';
import { slotDurationMin } from './slot-time';

/**
 * The slot search carries no service. A schedule belongs to one service and its slots are as long as that service's
 * default duration, so the length is the closest client-side match; the server still refuses a wrong pair (400).
 */
export function slotsForDuration(slots: ReadonlyArray<Slot>, durationMin: number | null): ReadonlyArray<Slot> {
  if (durationMin === null) return slots;
  return slots.filter((slot) => slotDurationMin(slot) === durationMin);
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
