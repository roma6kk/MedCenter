import { Logger } from '@nestjs/common';
import type { FhirClient } from '@medcenter/fhir';

import { FHIR_PAGE_SIZE } from '../../common/fhir-search';
import { InMemoryCacheStore } from '../cache/__tests__/in-memory-cache-store';
import { CACHE_KEYS, RedisCacheService } from '../cache/redis-cache.service';
import { DoctorSlotsService } from './doctor-slots.service';
import { bundle, DOCTOR_ID, NOW, RANGE, slot } from './__tests__/doctor-slots-fixture';
import { SLOT_SEARCH_MAX_PAGES } from './slot-search';

const FIRST_INSTANT = Date.parse('2026-11-01T21:00:00.000Z');
const SLOT_STEP_MS = 20_000;

function createTruncatedFhirClient(): jest.Mocked<FhirClient> {
  const fhirClient = { search: jest.fn(), read: jest.fn() } as unknown as jest.Mocked<FhirClient>;
  fhirClient.read.mockResolvedValue({ resourceType: 'Practitioner', id: DOCTOR_ID });
  fhirClient.search.mockImplementation(async (resourceType, params) => {
    if (resourceType === 'PractitionerRole') return bundle([{ id: 'role-1' }]);
    if (resourceType === 'Schedule') return bundle([{ id: 'sched-1' }]);
    const offset = Number((params ?? {})['_offset']);
    return bundle(
      Array.from({ length: FHIR_PAGE_SIZE }, (_, index) => {
        const start = FIRST_INSTANT + (offset + index) * SLOT_STEP_MS;
        return slot(`slot-${offset + index}`, new Date(start).toISOString(), new Date(start + SLOT_STEP_MS).toISOString());
      }),
    );
  });
  return fhirClient;
}

describe('DoctorSlotsService truncated search', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should flag the answer as truncated when the slot search hits the page cap', async () => {
    const fhirClient = createTruncatedFhirClient();
    const service = new DoctorSlotsService(fhirClient, new RedisCacheService(new InMemoryCacheStore()));

    const response = await service.listFree(DOCTOR_ID, RANGE);

    expect(response.truncated).toBe(true);
    expect(response.items).toHaveLength(SLOT_SEARCH_MAX_PAGES * FHIR_PAGE_SIZE);
  });

  it('should cache only the complete days when the search is cut off', async () => {
    const store = new InMemoryCacheStore();
    const service = new DoctorSlotsService(createTruncatedFhirClient(), new RedisCacheService(store));

    await service.listFree(DOCTOR_ID, RANGE);

    expect([...store.entries.keys()].sort()).toEqual([
      CACHE_KEYS.DOCTOR_SLOTS_DAY(DOCTOR_ID, '2026-11-02'),
      CACHE_KEYS.DOCTOR_SLOTS_DAY(DOCTOR_ID, '2026-11-03'),
    ]);
  });

  it('should not cache an empty page for a day after the cut-off when the search is truncated', async () => {
    const store = new InMemoryCacheStore();
    const service = new DoctorSlotsService(createTruncatedFhirClient(), new RedisCacheService(store));

    await service.listFree(DOCTOR_ID, RANGE);

    for (const day of ['04', '05', '06', '07', '08']) {
      expect(store.entries.has(CACHE_KEYS.DOCTOR_SLOTS_DAY(DOCTOR_ID, `2026-11-${day}`))).toBe(false);
    }
  });
});
