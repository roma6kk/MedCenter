/** slot-grouping — the counts per status of a schedule's slots and the «may be truncated» rule (the grouping by clinic day is `lib/clinic-time`). */
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

/**
 * The admin slot list is one page of the FHIR search: catalog-service does not read further pages, so HAPI's default page of
 * 20 is all that ever arrives. Exactly that many means «there may be more» (api-designer-spec §5.2.6 promises no paging).
 */
export const SLOT_PAGE_LIMIT = 20;

/** `true` when the answer is as long as the server's page, so the list and its totals cannot be trusted to be complete. */
export function mayBeTruncated(slots: ReadonlyArray<ScheduleSlot>): boolean {
  return slots.length >= SLOT_PAGE_LIMIT;
}
