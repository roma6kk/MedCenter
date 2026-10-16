import { ConflictException } from '@nestjs/common';
import { ERROR_CODES } from '@medcenter/contracts';
import type { FhirClient } from '@medcenter/fhir';

import { RedisCacheService } from '../cache/redis-cache.service';
import { SchedulesService } from './schedules.service';

const SCHEDULE_ID = 'sched-1';

describe('SchedulesService.remove', () => {
  let schedulesService: SchedulesService;
  let fhirClient: jest.Mocked<FhirClient>;
  let cache: RedisCacheService;

  beforeEach(() => {
    fhirClient = {
      search: jest.fn().mockResolvedValue({ entry: [] }),
      read: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      batch: jest.fn(),
    } as unknown as jest.Mocked<FhirClient>;
    cache = new RedisCacheService();
    schedulesService = new SchedulesService(fhirClient, cache);
  });

  it('should delete the schedule and drop its cached slot pages when it has no slots', async () => {
    const invalidate = jest.spyOn(cache, 'invalidate');

    await schedulesService.remove(SCHEDULE_ID, false);

    expect(fhirClient.delete).toHaveBeenCalledWith('Schedule', SCHEDULE_ID);
    expect(invalidate).toHaveBeenCalledWith([`slots:${SCHEDULE_ID}:`, 'catalog:doctor-slots:']);
  });

  it('should refuse with a catalogued SCHEDULE_IN_USE and keep the cache and the schedule when a slot is busy', async () => {
    fhirClient.search.mockResolvedValue({ entry: [{ resource: { resourceType: 'Slot', status: 'busy' } }] });
    const invalidate = jest.spyOn(cache, 'invalidate');

    const refusal = await schedulesService.remove(SCHEDULE_ID, true).then(
      () => undefined,
      (reason: unknown) => reason,
    );

    expect(refusal).toBeInstanceOf(ConflictException);
    const { errorCode } = (refusal as ConflictException).getResponse() as { errorCode: string };
    expect(ERROR_CODES).toContain(errorCode);
    expect(errorCode).toBe('SCHEDULE_IN_USE');
    expect(fhirClient.delete).not.toHaveBeenCalled();
    expect(fhirClient.batch).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('should drop the cached slot pages when the schedule is deactivated because retired slots remain', async () => {
    fhirClient.search.mockImplementation(async (_type, params) => ({
      entry: params?.['status'] === undefined ? [{ resource: { resourceType: 'Slot', id: 'x', status: 'entered-in-error' } }] : [],
    }));
    fhirClient.read.mockResolvedValue({ resourceType: 'Schedule', id: SCHEDULE_ID, active: true });
    const invalidate = jest.spyOn(cache, 'invalidate');

    await schedulesService.remove(SCHEDULE_ID, true);

    expect(fhirClient.update).toHaveBeenCalledWith('Schedule', SCHEDULE_ID, expect.objectContaining({ active: false }));
    expect(invalidate).toHaveBeenCalledWith([`slots:${SCHEDULE_ID}:`, 'catalog:doctor-slots:']);
  });
});
