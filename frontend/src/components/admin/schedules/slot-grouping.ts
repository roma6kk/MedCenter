import type { SlotStatus } from '@/components/feedback/stamp-badge';
import type { ScheduleSlot } from './schedule-types';

export type SlotCounts = Readonly<Record<SlotStatus, number>> & { readonly total: number };

export function countSlots(slots: ReadonlyArray<ScheduleSlot>): SlotCounts {
  const counts = { free: 0, busy: 0, 'entered-in-error': 0 };
  slots.forEach((slot) => {
    counts[slot.status] += 1;
  });
  return { ...counts, total: slots.length };
}

// catalog-service reads one FHIR page, so HAPI's default page of 20 is all that ever arrives; exactly that many means «there may be more».
export const SLOT_PAGE_LIMIT = 20;

export function mayBeTruncated(slots: ReadonlyArray<ScheduleSlot>): boolean {
  return slots.length >= SLOT_PAGE_LIMIT;
}
