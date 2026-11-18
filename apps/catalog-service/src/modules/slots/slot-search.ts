import type { FhirClient, FhirResource } from '@medcenter/fhir';
import { toSlotResponseDto, type SlotResponseDto } from '@medcenter/fhir-mappers';

import { orReferences, searchAllPages, searchPages } from '../../common/fhir-search';
import { toScheduleSummaryDto } from './schedule-summary.mapper';
import type { InstantRange } from './slot-range';

export function idsOf(resources: readonly FhirResource[]): string[] {
  return resources.map((resource) => resource.id).filter((id): id is string => id !== undefined && id !== '');
}

/** `active:not=false` keeps schedules that never set `active`: only an explicit deactivation hides one. */
export async function searchActiveSchedules(fhirClient: FhirClient, actors: string): Promise<FhirResource[]> {
  return searchAllPages(fhirClient, 'Schedule', { actor: actors, 'active:not': 'false', _sort: '_id' });
}

/** 50 x 200 = 10 000: a query spans at most 32 clinic days of 5-minute slots (288 a day) for one doctor. */
export const SLOT_SEARCH_MAX_PAGES = 50;

export type ServiceSlotDto = SlotResponseDto & { readonly serviceId?: string };

export function withServiceIds(slots: readonly SlotResponseDto[], schedules: readonly FhirResource[]): ServiceSlotDto[] {
  const serviceOf = new Map(schedules.map((schedule) => [schedule.id ?? '', toScheduleSummaryDto(schedule).serviceId]));
  return slots.map((slot) => {
    const serviceId = serviceOf.get(slot.scheduleId);
    return serviceId === undefined ? slot : { ...slot, serviceId };
  });
}

interface ScheduleSlots {
  readonly slots: SlotResponseDto[];
  readonly truncated: boolean;
}

/** Sorted by instant (offsets may differ) and de-duplicated by id: offset paging can repeat a row when a slot changes. */
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
