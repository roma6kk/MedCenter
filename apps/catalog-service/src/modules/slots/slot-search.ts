import type { FhirClient, FhirResource } from '@medcenter/fhir';
import { toSlotResponseDto, type SlotResponseDto } from '@medcenter/fhir-mappers';

import { orReferences, searchAllPages, searchPages } from '../../common/fhir-search';
import type { InstantRange } from './slot-range';

/** Ids of resources that carry one (search results always do). */
export function idsOf(resources: readonly FhirResource[]): string[] {
  return resources.map((resource) => resource.id).filter((id): id is string => id !== undefined && id !== '');
}

/**
 * Schedules of the given actors (comma-separated references = OR). `active:not=false`
 * keeps schedules that never set `active`: only an explicit deactivation hides one.
 * Paged with a stable `_id` order, so a long list is read whole or logged as
 * truncated (`searchAllPages`) rather than silently cut at the first page.
 */
export async function searchActiveSchedules(fhirClient: FhirClient, actors: string): Promise<FhirResource[]> {
  return searchAllPages(fhirClient, 'Schedule', { actor: actors, 'active:not': 'false', _sort: '_id' });
}

/**
 * Page cap of a slot search: 50 x 200 = 10 000 slots. A query spans at most 32
 * clinic days (31-day range, both ends inclusive) and the shortest slot is 5
 * minutes (288 a day), so one doctor with one schedule yields at most 9 216 —
 * every slot of the longest supported range fits. Several schedules per doctor
 * can still exceed it; that is reported as `truncated`, never silently dropped.
 */
export const SLOT_SEARCH_MAX_PAGES = 50;

/** Slots found by `searchScheduleSlots`; `truncated` means the page cap cut the tail. */
export interface ScheduleSlots {
  readonly slots: SlotResponseDto[];
  readonly truncated: boolean;
}

/**
 * Slots of the schedules whose `start` falls in the inclusive range, sorted by
 * instant (offsets may differ, so not by string) and de-duplicated by id —
 * offset paging can repeat a row when a slot changes between two pages.
 *
 * The range goes to HAPI as explicit UTC instants, never as bare dates (HAPI
 * would read those in its own zone). `_sort=start,_id` is a total order — slots
 * of different schedules can share a `start`, and a tie on the page boundary
 * would repeat or lose one. Because the order is by `start`, a truncated result
 * is a complete prefix: every slot before the last one returned is present.
 */
export async function searchScheduleSlots(
  fhirClient: FhirClient,
  scheduleIds: readonly string[],
  range: InstantRange,
  status: string,
): Promise<ScheduleSlots> {
  if (scheduleIds.length === 0) {
    return { slots: [], truncated: false };
  }
  const { resources, truncated } = await searchPages(
    fhirClient,
    'Slot',
    {
      schedule: orReferences('Schedule', scheduleIds),
      status,
      start: [`ge${new Date(range.fromMs).toISOString()}`, `le${new Date(range.toMs).toISOString()}`],
      _sort: 'start,_id',
    },
    { maxPages: SLOT_SEARCH_MAX_PAGES },
  );
  const unique = new Map(resources.map((slot) => [slot.id ?? '', toSlotResponseDto(slot)]));
  const slots = [...unique.values()].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return { slots, truncated };
}
