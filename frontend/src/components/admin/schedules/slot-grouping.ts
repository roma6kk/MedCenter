/** slot-grouping — slots of a schedule grouped by clinic day for the slot grid, with the counts per status. */
import type { SlotStatus } from '@/components/feedback/stamp-badge';
import { clinicDayOf } from '../shared/admin-dates';
import type { ScheduleSlot } from './schedule-types';

export interface SlotDay {
  readonly day: string;
  readonly slots: ReadonlyArray<ScheduleSlot>;
}

export type SlotCounts = Readonly<Record<SlotStatus, number>> & { readonly total: number };

/** Days in ascending order, slots of a day by start time. The day is the clinic day (Europe/Minsk), not the UTC one. */
export function groupSlotsByDay(slots: ReadonlyArray<ScheduleSlot>): ReadonlyArray<SlotDay> {
  const byDay = new Map<string, ScheduleSlot[]>();
  [...slots]
    .sort((a, b) => a.start.localeCompare(b.start))
    .forEach((slot) => {
      const day: string = clinicDayOf(slot.start);
      byDay.set(day, [...(byDay.get(day) ?? []), slot]);
    });
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, daySlots]) => ({ day, slots: daySlots }));
}

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
