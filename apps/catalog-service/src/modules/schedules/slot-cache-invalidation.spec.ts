import type { FhirClient } from '@medcenter/fhir';

import { InMemoryCacheStore } from '../cache/__tests__/in-memory-cache-store';
import { CACHE_KEYS, RedisCacheService } from '../cache/redis-cache.service';
import { SLOT_DURATION_EXT, WEEKLY_WINDOWS_EXT } from './schedule.constants';
import { SchedulesService } from './schedules.service';
import { SlotGeneratorService } from './slot-generator.service';

const SCHEDULE_ID = 'sched-9';
const SCHEDULE_PAGE = `${CACHE_KEYS.SCHEDULE_SLOTS(SCHEDULE_ID)}2026-11-02:2026-11-03:all`;
const DOCTOR_PAGE = CACHE_KEYS.DOCTOR_SLOTS_DAY('prac-1', '2026-11-02');
const UNRELATED = CACHE_KEYS.SERVICES_PAGE(1, 20);

function createFhirClientMock(): jest.Mocked<FhirClient> {
  return {
    search: jest.fn().mockResolvedValue({ entry: [] }),
    read: jest.fn().mockResolvedValue({
      resourceType: 'Schedule',
      id: SCHEDULE_ID,
      extension: [
        { url: SLOT_DURATION_EXT, valueInteger: 30 },
        { url: WEEKLY_WINDOWS_EXT, valueString: JSON.stringify([{ dayOfWeek: 'MO', startTime: '09:00', endTime: '10:00' }]) },
      ],
    }),
    delete: jest.fn().mockResolvedValue(undefined),
    batch: jest.fn().mockResolvedValue({
      resourceType: 'Bundle',
      entry: [{ response: { status: '201 Created' } }, { response: { status: '201 Created' } }],
    }),
  } as unknown as jest.Mocked<FhirClient>;
}

async function seededStore(): Promise<InMemoryCacheStore> {
  const store = new InMemoryCacheStore();
  await Promise.all([SCHEDULE_PAGE, DOCTOR_PAGE, UNRELATED].map((key) => store.set(key, '[]')));
  return store;
}

describe('slot cache invalidation', () => {
  it('should drop the schedule and doctor slot pages when generation writes new slots', async () => {
    // Arrange
    const store = await seededStore();
    const generator = new SlotGeneratorService(createFhirClientMock(), new RedisCacheService(store));

    // Act
    const result = await generator.generate(SCHEDULE_ID, { from: '2026-11-02', to: '2026-11-02' });

    // Assert
    expect(result.generated).toBe(2);
    expect([...store.entries.keys()]).toEqual([UNRELATED]);
  });

  it('should keep the cached pages when generation writes nothing new', async () => {
    // Arrange
    const store = await seededStore();
    const fhirClient = createFhirClientMock();
    fhirClient.search.mockResolvedValue({
      entry: [
        // 09:00 and 09:30 Minsk time on Monday 2 Nov.
        { resource: { resourceType: 'Slot', start: '2026-11-02T06:00:00.000Z' } },
        { resource: { resourceType: 'Slot', start: '2026-11-02T06:30:00.000Z' } },
      ],
    });
    const generator = new SlotGeneratorService(fhirClient, new RedisCacheService(store));

    // Act
    const result = await generator.generate(SCHEDULE_ID, { from: '2026-11-02', to: '2026-11-02' });

    // Assert
    expect(result.generated).toBe(0);
    expect(store.entries.size).toBe(3);
  });

  it('should drop the schedule and doctor slot pages when a schedule is deleted', async () => {
    // Arrange
    const store = await seededStore();
    const service = new SchedulesService(createFhirClientMock(), new RedisCacheService(store));

    // Act
    await service.remove(SCHEDULE_ID, false);

    // Assert
    expect([...store.entries.keys()]).toEqual([UNRELATED]);
  });
});
