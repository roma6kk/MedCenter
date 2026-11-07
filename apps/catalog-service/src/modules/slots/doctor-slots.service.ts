import { Inject, Injectable } from '@nestjs/common';
import { clinicDateOf, clinicDayEndMs, clinicDaysBetween, clinicDayStartMs } from '@medcenter/common';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';

import { orReferences, searchAllPages } from '../../common/fhir-search';
import { CACHE_KEYS, CACHE_TTLS, RedisCacheService } from '../cache/redis-cache.service';
import type { DoctorSlotsResponseDto } from './dto/doctor-slots-response.dto';
import type { SlotRange } from './slot-range';
import { idsOf, searchActiveSchedules, searchScheduleSlots, withServiceIds, type ServiceSlotDto } from './slot-search';

@Injectable()
export class DoctorSlotsService {
  constructor(
    @Inject(FHIR_CLIENT) private readonly fhirClient: FhirClient,
    private readonly cache: RedisCacheService,
  ) {}

  /** The route is public: the cache key must not depend on how a client spells its window, or the key space is unbounded. */
  async listFree(practitionerId: string, range: SlotRange): Promise<DoctorSlotsResponseDto> {
    const nowMs = Date.now();
    const days = clinicDaysBetween(Math.max(range.fromMs, nowMs), range.toMs);
    const { pages, truncated } = await this.readDayPages(practitionerId, days);
    const items = pages.flat().filter((slot) => {
      const startMs = Date.parse(slot.start);
      return startMs > nowMs && startMs >= range.fromMs && startMs <= range.toMs;
    });
    return { doctorId: practitionerId, from: range.from, to: range.to, items, ...(truncated ? { truncated } : {}) };
  }

  private async readDayPages(practitionerId: string, days: readonly string[]): Promise<DayPages> {
    const cached = await Promise.all(
      days.map((day) => this.cache.getJson<ServiceSlotDto[]>(CACHE_KEYS.DOCTOR_SLOTS_DAY(practitionerId, day))),
    );
    const missing = days.filter((_, index) => cached[index] === null);
    if (missing.length === 0) {
      return { pages: cached.map((page) => page ?? []), truncated: false };
    }
    const { slots, truncated } = await this.loadFreeSlots(practitionerId, missing);
    const loaded = groupByClinicDay(slots);
    // A cut-off search says nothing about days after its last slot: caching them as empty would hide real slots.
    await Promise.all(
      (truncated ? daysBeforeLastSlot(missing, slots) : missing).map((day) =>
        this.cache.setJson(CACHE_KEYS.DOCTOR_SLOTS_DAY(practitionerId, day), loaded.get(day) ?? [], CACHE_TTLS.SLOTS_SECONDS),
      ),
    );
    return { pages: days.map((day, index) => cached[index] ?? loaded.get(day) ?? []), truncated };
  }

  /** The practitioner is read first: an unknown id (the route is public) costs one read, not a slot search. */
  private async loadFreeSlots(practitionerId: string, days: readonly string[]): Promise<FreeSlots> {
    const first = days[0] ?? '';
    const last = days[days.length - 1] ?? first;
    await this.fhirClient.read('Practitioner', practitionerId);
    const roles = await searchAllPages(this.fhirClient, 'PractitionerRole', {
      practitioner: `Practitioner/${practitionerId}`,
      'active:not': 'false',
      _sort: '_id',
    });
    const actors = [`Practitioner/${practitionerId}`, orReferences('PractitionerRole', idsOf(roles))]
      .filter((reference) => reference !== '')
      .join(',');
    const schedules = await searchActiveSchedules(this.fhirClient, actors);
    const { slots, truncated } = await searchScheduleSlots(
      this.fhirClient,
      idsOf(schedules),
      { fromMs: clinicDayStartMs(first), toMs: clinicDayEndMs(last) },
      'free',
    );
    return { slots: withServiceIds(slots, schedules), truncated };
  }
}

interface FreeSlots {
  readonly slots: ServiceSlotDto[];
  readonly truncated: boolean;
}

interface DayPages {
  readonly pages: ServiceSlotDto[][];
  readonly truncated: boolean;
}

function daysBeforeLastSlot(days: readonly string[], slots: readonly ServiceSlotDto[]): string[] {
  const lastSlot = slots[slots.length - 1];
  if (lastSlot === undefined) {
    return [];
  }
  const lastDay = clinicDateOf(Date.parse(lastSlot.start));
  return days.filter((day) => day < lastDay);
}

function groupByClinicDay(slots: readonly ServiceSlotDto[]): Map<string, ServiceSlotDto[]> {
  const pages = new Map<string, ServiceSlotDto[]>();
  for (const slot of slots) {
    const day = clinicDateOf(Date.parse(slot.start));
    const page = pages.get(day);
    if (page === undefined) {
      pages.set(day, [slot]);
    } else {
      page.push(slot);
    }
  }
  return pages;
}
