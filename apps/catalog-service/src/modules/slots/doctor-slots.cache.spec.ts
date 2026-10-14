import { Logger } from '@nestjs/common';

import { InMemoryCacheStore } from '../cache/__tests__/in-memory-cache-store';
import { CACHE_KEYS, RedisCacheService } from '../cache/redis-cache.service';
import { DoctorSlotsService } from './doctor-slots.service';
import {
  createFhirClientMock,
  DOCTOR_ID,
  NOW,
  RANGE,
  SCHEDULED,
  searchCallsFor,
} from './__tests__/doctor-slots-fixture';
import { resolveSlotRange } from './slot-range';

/** Per-day cache pages of the public free-slot search (API §5.2.8): one key per doctor and clinic day. */
describe('DoctorSlotsService cache', () => {
  const scheduled = SCHEDULED;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('cache', () => {
    it('should serve a repeated request from the 15 s cache when the days match', async () => {
      // Arrange
      const store = new InMemoryCacheStore();
      const fhirClient = createFhirClientMock(scheduled);
      const service = new DoctorSlotsService(fhirClient, new RedisCacheService(store));

      // Act
      await service.listFree(DOCTOR_ID, RANGE);
      const second = await service.listFree(DOCTOR_ID, RANGE);

      // Assert
      expect(second.items).toHaveLength(2);
      expect(searchCallsFor(fhirClient, 'Slot')).toHaveLength(1);
    });

    it('should keep one page per clinic day when the window is cached', async () => {
      // Arrange
      const store = new InMemoryCacheStore();
      const service = new DoctorSlotsService(createFhirClientMock(scheduled), new RedisCacheService(store));

      // Act
      await service.listFree(DOCTOR_ID, RANGE);

      // Assert — 2 .. 8 Nov, the slots on the 2nd and an empty page for every other day.
      const days = ['02', '03', '04', '05', '06', '07', '08'];
      expect([...store.entries.keys()].sort()).toEqual(
        days.map((day) => CACHE_KEYS.DOCTOR_SLOTS_DAY(DOCTOR_ID, `2026-11-${day}`)),
      );
      expect(JSON.parse(store.entries.get(CACHE_KEYS.DOCTOR_SLOTS_DAY(DOCTOR_ID, '2026-11-02')) ?? '[]')).toHaveLength(2);
      expect(store.entries.get(CACHE_KEYS.DOCTOR_SLOTS_DAY(DOCTOR_ID, '2026-11-03'))).toBe('[]');
    });

    it('should share one set of keys when two spellings describe the same window', async () => {
      // Arrange
      const store = new InMemoryCacheStore();
      const fhirClient = createFhirClientMock(scheduled);
      const service = new DoctorSlotsService(fhirClient, new RedisCacheService(store));
      const zulu = resolveSlotRange({ from: '2026-11-02T00:00:00Z', to: '2026-11-04T12:00:00.000Z' }, NOW);
      const offset = resolveSlotRange({ from: '2026-11-02T03:00:00+03:00', to: '2026-11-04T12:00:00.000+00:00' }, NOW);

      // Act
      await service.listFree(DOCTOR_ID, zulu);
      const keysAfterFirst = [...store.entries.keys()].sort();
      await service.listFree(DOCTOR_ID, offset);

      // Assert
      expect([...store.entries.keys()].sort()).toEqual(keysAfterFirst);
      expect(searchCallsFor(fhirClient, 'Slot')).toHaveLength(1);
    });

    it('should not grow the key set when a client varies the milliseconds of the same window', async () => {
      // Arrange
      const store = new InMemoryCacheStore();
      const service = new DoctorSlotsService(createFhirClientMock(scheduled), new RedisCacheService(store));

      // Act
      for (let millis = 0; millis < 50; millis += 1) {
        const to = `2026-11-04T12:00:00.${String(millis).padStart(3, '0')}Z`;
        await service.listFree(DOCTOR_ID, resolveSlotRange({ from: '2026-11-02', to }, NOW));
      }

      // Assert — a key per spelling would have written 50 pages of 3 days each.
      expect(store.entries.size).toBe(3);
    });

    it('should search only the uncached days when a later window overlaps a cached one', async () => {
      // Arrange
      const store = new InMemoryCacheStore();
      const fhirClient = createFhirClientMock(scheduled);
      const service = new DoctorSlotsService(fhirClient, new RedisCacheService(store));
      await service.listFree(DOCTOR_ID, resolveSlotRange({ from: '2026-11-02', to: '2026-11-04' }, NOW));

      // Act
      await service.listFree(DOCTOR_ID, resolveSlotRange({ from: '2026-11-03', to: '2026-11-06' }, NOW));

      // Assert — only 5 and 6 Nov were missing.
      const searches = searchCallsFor(fhirClient, 'Slot');
      expect(searches).toHaveLength(2);
      expect(searches[1]).toMatchObject({ start: ['ge2026-11-04T21:00:00.000Z', 'le2026-11-06T20:59:59.999Z'] });
    });

    it('should reload the day when its cached page is corrupt', async () => {
      // Arrange
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const store = new InMemoryCacheStore();
      await store.set(CACHE_KEYS.DOCTOR_SLOTS_DAY(DOCTOR_ID, '2026-11-02'), '{"broken":');
      const fhirClient = createFhirClientMock(scheduled);
      const service = new DoctorSlotsService(fhirClient, new RedisCacheService(store));

      // Act
      const response = await service.listFree(DOCTOR_ID, resolveSlotRange({ from: '2026-11-02', to: '2026-11-02' }, NOW));

      // Assert
      expect(response.items).toHaveLength(2);
      expect(searchCallsFor(fhirClient, 'Slot')).toHaveLength(1);
    });
  });

  describe('past and clamped windows', () => {
    it('should start the search on today when the window begins in the past', async () => {
      // Arrange — 4 Nov 10:00Z is 13:00 in Minsk.
      jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-04T10:00:00.000Z'));
      const fhirClient = createFhirClientMock(scheduled);
      const service = new DoctorSlotsService(fhirClient, new RedisCacheService());

      // Act
      await service.listFree(DOCTOR_ID, RANGE);

      // Assert
      expect(searchCallsFor(fhirClient, 'Slot')[0]).toMatchObject({
        start: ['ge2026-11-03T21:00:00.000Z', 'le2026-11-08T20:59:59.999Z'],
      });
    });

    it('should return an empty list without any HAPI call when the window ended already', async () => {
      // Arrange
      jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-12-01T10:00:00.000Z'));
      const fhirClient = createFhirClientMock(scheduled);
      const service = new DoctorSlotsService(fhirClient, new RedisCacheService(new InMemoryCacheStore()));

      // Act
      const response = await service.listFree(DOCTOR_ID, RANGE);

      // Assert
      expect(response.items).toEqual([]);
      expect(fhirClient.read).not.toHaveBeenCalled();
      expect(fhirClient.search).not.toHaveBeenCalled();
    });
  });
});
