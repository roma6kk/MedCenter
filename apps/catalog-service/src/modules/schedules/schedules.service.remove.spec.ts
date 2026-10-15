import { ConflictException } from '@nestjs/common';
import { ERROR_CODES } from '@medcenter/contracts';
import type { FhirClient } from '@medcenter/fhir';

import { RedisCacheService } from '../cache/redis-cache.service';
import { SchedulesService } from './schedules.service';

const SCHEDULE_ID = 'sched-1';
const BUSY_SLOTS = { entry: [{ resource: { resourceType: 'Slot', status: 'busy' } }] };

describe('SchedulesService.remove', () => {
  let schedulesService: SchedulesService;
  let fhirClient: jest.Mocked<FhirClient>;

  beforeEach(() => {
    fhirClient = {
      search: jest.fn(),
      read: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      batch: jest.fn(),
    } as unknown as jest.Mocked<FhirClient>;
    schedulesService = new SchedulesService(fhirClient, new RedisCacheService());
  });

  it('should throw the catalogued SCHEDULE_IN_USE error code when busy slots exist and cascade is off', async () => {
    // Arrange
    fhirClient.search.mockResolvedValue(BUSY_SLOTS);

    // Act
    const error = await schedulesService.remove(SCHEDULE_ID, false).then(
      () => undefined,
      (e: unknown) => e,
    );

    // Assert — ProblemDetailsFilter promotes only catalogued codes; an unknown one would degrade to CONFLICT.
    expect(error).toBeInstanceOf(ConflictException);
    const { errorCode } = (error as ConflictException).getResponse() as { errorCode: string };
    expect(errorCode).toBe('SCHEDULE_IN_USE');
    expect(ERROR_CODES).toContain(errorCode);
    expect(fhirClient.delete).not.toHaveBeenCalled();
  });

  it('should delete the schedule when busy slots exist and cascade is on', async () => {
    // Arrange
    fhirClient.search.mockResolvedValue(BUSY_SLOTS);

    // Act
    await schedulesService.remove(SCHEDULE_ID, true);

    // Assert
    expect(fhirClient.delete).toHaveBeenCalledWith('Schedule', SCHEDULE_ID);
  });

  it('should look up busy slots of the schedule when the delete is checked', async () => {
    // Arrange
    fhirClient.search.mockResolvedValue({ entry: [] });

    // Act
    await schedulesService.remove(SCHEDULE_ID, false);

    // Assert
    expect(fhirClient.search).toHaveBeenCalledWith('Slot', { schedule: `Schedule/${SCHEDULE_ID}`, status: 'busy' });
    expect(fhirClient.delete).toHaveBeenCalledWith('Schedule', SCHEDULE_ID);
  });
});
