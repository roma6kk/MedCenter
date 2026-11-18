import { clinicDayEndMs, clinicDaysBetween, clinicDayStartMs } from '@medcenter/common';
import type { FhirClient } from '@medcenter/fhir';

import { FHIR_PAGE_SIZE, searchPages } from '../../common/fhir-search';
import { deleteOrRetire } from './schedule-removal';
import type { PlannedSlot } from './slot-planner';

const MAX_SEARCH_PAGES = 150;

/** Deletes the free slots of the schedule in the date range that are not in the planned grid. Busy slots are never searched. Returns how many were removed. */
export async function removeStaleFreeSlots(
  fhirClient: FhirClient,
  scheduleId: string,
  fromMs: number,
  toMs: number,
  planned: readonly PlannedSlot[],
): Promise<number> {
  const days = clinicDaysBetween(fromMs, toMs);
  const first = days[0];
  const last = days[days.length - 1];
  if (first === undefined || last === undefined) {
    return 0;
  }
  const { resources } = await searchPages(
    fhirClient,
    'Slot',
    {
      schedule: `Schedule/${scheduleId}`,
      status: 'free',
      start: [`ge${new Date(clinicDayStartMs(first)).toISOString()}`, `le${new Date(clinicDayEndMs(last)).toISOString()}`],
      _sort: 'start,_id',
    },
    { maxPages: MAX_SEARCH_PAGES },
  );
  const grid = new Set(planned.map((slot) => `${Date.parse(slot.start)}|${Date.parse(slot.end)}`));
  const stale = resources.filter((slot) => !grid.has(`${Date.parse(String(slot['start']))}|${Date.parse(String(slot['end']))}`));
  for (let offset = 0; offset < stale.length; offset += FHIR_PAGE_SIZE) {
    await deleteOrRetire(fhirClient, scheduleId, stale.slice(offset, offset + FHIR_PAGE_SIZE));
  }
  return stale.length;
}
