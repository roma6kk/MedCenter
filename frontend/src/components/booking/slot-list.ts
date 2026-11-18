import type { Slot } from '@/components/catalog/catalog-types';
import { slotDurationMin } from './slot-time';

export function slotsForService(slots: ReadonlyArray<Slot>, durationMin: number | null, serviceId: string | null = null): ReadonlyArray<Slot> {
  if (durationMin === null && serviceId === null) return slots;
  return slots.filter((slot) => {
    if (serviceId !== null && slot.serviceId !== undefined) return slot.serviceId === serviceId;
    return durationMin === null || slotDurationMin(slot) === durationMin;
  });
}

export function withTakenSlot(slots: ReadonlyArray<Slot>, taken: Slot | null): ReadonlyArray<Slot> {
  if (taken === null) return slots;
  const busy: Slot = { ...taken, status: 'busy' };
  return slots.some((slot) => slot.id === taken.id) ? slots.map((slot) => (slot.id === taken.id ? busy : slot)) : [...slots, busy];
}

export function isSelectable(slot: Slot): boolean {
  return slot.status === 'free';
}

export function nearestFreeSlots(slots: ReadonlyArray<Slot>, durationMin: number | null, limit: number, serviceId: string | null = null): ReadonlyArray<Slot> {
  return slotsForService(slots, durationMin, serviceId)
    .filter(isSelectable)
    .map((slot) => ({ slot, startMs: Date.parse(slot.start) }))
    .sort((a, b) => a.startMs - b.startMs)
    .slice(0, limit)
    .map(({ slot }) => slot);
}
