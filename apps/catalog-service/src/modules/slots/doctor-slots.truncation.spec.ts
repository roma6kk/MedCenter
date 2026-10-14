import { Logger } from '@nestjs/common';
import type { FhirClient } from '@medcenter/fhir';

import { FHIR_PAGE_SIZE } from '../../common/fhir-search';
import { InMemoryCacheStore } from '../cache/__tests__/in-memory-cache-store';
import { CACHE_KEYS, RedisCacheService } from '../cache/redis-cache.service';
import { DoctorSlotsService } from './doctor-slots.service';
import { bundle, DOCTOR_ID, NOW, RANGE, slot } from './__tests__/doctor-slots-fixture';
import { SLOT_SEARCH_MAX_PAGES } from './slot-search';

/** 2 Nov 00:00 in Minsk. */
const FIRST_INSTANT = Date.parse('2026-11-01T21:00:00.000Z');
const SLOT_STEP_MS = 20_000;

/** A Slot search whose every page is full: the 10 000 slots run from 2 Nov 00:00 to 4 Nov 04:33 (Minsk). */
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

/** What the public free-slot search does when HAPI holds more slots than the page cap reads (API §5.2.8). */
describe('DoctorSlotsService truncated search', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    // The search logs the cut-off on purpose; the tests assert the effect, not the log line.
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should flag the answer as truncated when the slot search hits the page cap', async () => {
    // Arrange
    const fhirClient = createTruncatedFhirClient();
    const service = new DoctorSlotsService(fhirClient, new RedisCacheService(new InMemoryCacheStore()));

    // Act
    const response = await service.listFree(DOCTOR_ID, RANGE);

    // Assert — every slot that was read is still offered, in start order.
    expect(response.truncated).toBe(true);
    expect(response.items).toHaveLength(SLOT_SEARCH_MAX_PAGES * FHIR_PAGE_SIZE);
  });

  it('should cache only the complete days when the search is cut off', async () => {
    // Arrange
    const store = new InMemoryCacheStore();
    const service = new DoctorSlotsService(createTruncatedFhirClient(), new RedisCacheService(store));

    // Act
    await service.listFree(DOCTOR_ID, RANGE);

    // Assert — 2 and 3 Nov are whole; 4 Nov is half read and 5..8 Nov were never reached.
    expect([...store.entries.keys()].sort()).toEqual([
      CACHE_KEYS.DOCTOR_SLOTS_DAY(DOCTOR_ID, '2026-11-02'),
      CACHE_KEYS.DOCTOR_SLOTS_DAY(DOCTOR_ID, '2026-11-03'),
    ]);
  });

  it('should not cache an empty page for a day after the cut-off when the search is truncated', async () => {
    // Arrange
    const store = new InMemoryCacheStore();
    const service = new DoctorSlotsService(createTruncatedFhirClient(), new RedisCacheService(store));

    // Act
    await service.listFree(DOCTOR_ID, RANGE);

    // Assert — a cached `[]` would tell the next 15 s of clients that 5 Nov has no slots.
    for (const day of ['04', '05', '06', '07', '08']) {
      expect(store.entries.has(CACHE_KEYS.DOCTOR_SLOTS_DAY(DOCTOR_ID, `2026-11-${day}`))).toBe(false);
    }
  });
});
