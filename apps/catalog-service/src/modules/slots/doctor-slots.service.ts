import { Inject, Injectable } from '@nestjs/common';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';
import type { SlotResponseDto } from '@medcenter/fhir-mappers';

import { clinicDateOf, clinicDayEndMs, clinicDaysBetween, clinicDayStartMs } from '../../common/clinic-calendar';
import { orReferences, searchAllPages } from '../../common/fhir-search';
import { CACHE_KEYS, CACHE_TTLS, RedisCacheService } from '../cache/redis-cache.service';
import type { DoctorSlotsResponseDto } from './dto/doctor-slots-response.dto';
import type { SlotRange } from './slot-range';
import { idsOf, searchActiveSchedules, searchScheduleSlots, type ScheduleSlots } from './slot-search';

/**
 * Public free-slot search of one doctor (API §5.2.8, FR-003, NFR-005).
 *
 * The doctor is a `Practitioner` (the id the catalog of API §4.1/§4.2 hands
 * out). Slots hang off `Schedule`s whose actor is one of the practitioner's
 * `PractitionerRole`s — or the practitioner itself — so the lookup walks
 * Practitioner → PractitionerRole → Schedule → Slot(status=free).
 */
@Injectable()
export class DoctorSlotsService {
  constructor(
    @Inject(FHIR_CLIENT) private readonly fhirClient: FhirClient,
    private readonly cache: RedisCacheService,
  ) {}

  /**
   * The route is public, so the cache key must not depend on how a client spells
   * its window (`Z` vs `+00:00`, `.001` vs `.002`, date vs date-time): the cache
   * holds one 15 s page per (doctor, clinic day), and the exact window is applied
   * in memory. Slots that already started are dropped on every read, so a cached
   * page never offers the past; a stale `free` slot is safe because booking
   * re-checks it with `If-Match` (ADR-012).
   *
   * `truncated: true` marks an answer cut by the slot page cap (see
   * `SLOT_SEARCH_MAX_PAGES`): later days may be missing, and they were not cached.
   */
  async listFree(practitionerId: string, range: SlotRange): Promise<DoctorSlotsResponseDto> {
    const nowMs = Date.now();
    // Nothing that started is ever offered, so the first day worth reading is today.
    const days = clinicDaysBetween(Math.max(range.fromMs, nowMs), range.toMs);
    const { pages, truncated } = await this.readDayPages(practitionerId, days);
    const items = pages.flat().filter((slot) => {
      const startMs = Date.parse(slot.start);
      return startMs > nowMs && startMs >= range.fromMs && startMs <= range.toMs;
    });
    return { doctorId: practitionerId, from: range.from, to: range.to, items, ...(truncated ? { truncated } : {}) };
  }

  /** One page per day, in day order; the days missing from the cache load in a single search. */
  private async readDayPages(practitionerId: string, days: readonly string[]): Promise<DayPages> {
    const cached = await Promise.all(
      days.map((day) => this.cache.getJson<SlotResponseDto[]>(CACHE_KEYS.DOCTOR_SLOTS_DAY(practitionerId, day))),
    );
    const missing = days.filter((_, index) => cached[index] === null);
    if (missing.length === 0) {
      return { pages: cached.map((page) => page ?? []), truncated: false };
    }
    const { slots, truncated } = await this.loadFreeSlots(practitionerId, missing);
    const loaded = groupByClinicDay(slots);
    // A cut-off search knows nothing about the days after its last slot, and the
    // day of that slot may be half read: caching them as empty would hide real slots.
    await Promise.all(
      (truncated ? daysBeforeLastSlot(missing, slots) : missing).map((day) =>
        this.cache.setJson(CACHE_KEYS.DOCTOR_SLOTS_DAY(practitionerId, day), loaded.get(day) ?? [], CACHE_TTLS.SLOTS_SECONDS),
      ),
    );
    return { pages: days.map((day, index) => cached[index] ?? loaded.get(day) ?? []), truncated };
  }

  /**
   * Free slots from the first to the last of `days` (whole clinic days, ascending).
   * The practitioner is read first and on its own: an unknown id (the public route
   * accepts any) costs HAPI one read that ends in 404, not a read plus a role search.
   */
  private async loadFreeSlots(practitionerId: string, days: readonly string[]): Promise<ScheduleSlots> {
    const first = days[0] ?? '';
    const last = days[days.length - 1] ?? first;
    // The read turns an unknown doctor into 404 NOT_FOUND instead of an empty list.
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
    return searchScheduleSlots(
      this.fhirClient,
      idsOf(schedules),
      { fromMs: clinicDayStartMs(first), toMs: clinicDayEndMs(last) },
      'free',
    );
  }
}

interface DayPages {
  readonly pages: SlotResponseDto[][];
  readonly truncated: boolean;
}

/** The days of `days` that end before the clinic day of the last slot read (nothing is safe without one). */
function daysBeforeLastSlot(days: readonly string[], slots: readonly SlotResponseDto[]): string[] {
  const lastSlot = slots[slots.length - 1];
  if (lastSlot === undefined) {
    return [];
  }
  const lastDay = clinicDateOf(Date.parse(lastSlot.start));
  return days.filter((day) => day < lastDay);
}

/** Splits slots (already ordered by start) into per-clinic-day pages. */
function groupByClinicDay(slots: readonly SlotResponseDto[]): Map<string, SlotResponseDto[]> {
  const pages = new Map<string, SlotResponseDto[]>();
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
