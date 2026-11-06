import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { FhirClient } from '@medcenter/fhir';

import { transactionResponder } from '@medcenter/testing';
import { RedisCacheService } from '../cache/redis-cache.service';
import type { CreateScheduleDto } from './dto/create-schedule.dto';
import { SchedulesService } from './schedules.service';

const ACTOR = { sub: 'admin-1', requestId: 'req-1' };

function body(horizonFrom: string, horizonTo: string): CreateScheduleDto {
  return {
    practitionerRoleId: 'role-1',
    roomId: 'room-1',
    serviceId: 'svc-1',
    horizonFrom,
    horizonTo,
    slotDurationMin: 30,
    windows: [{ dayOfWeek: 'MO', startTime: '09:00', endTime: '10:00' }],
  };
}

describe('SchedulesService.create validation', () => {
  let schedulesService: SchedulesService;
  let fhirClient: jest.Mocked<FhirClient>;

  beforeEach(() => {
    fhirClient = {
      read: jest.fn().mockResolvedValue({ resourceType: 'Anything', id: 'x' }),
      search: jest.fn().mockResolvedValue({ entry: [] }),
      batch: jest.fn().mockImplementation(transactionResponder()),
    } as unknown as jest.Mocked<FhirClient>;
    schedulesService = new SchedulesService(fhirClient, new RedisCacheService());
  });

  it.each([
    ['91 days', '2026-11-01', '2027-01-31'],
    ['reversed bounds', '2026-12-01', '2026-11-01'],
  ])('should refuse a horizon of %s with 400 and touch HAPI not at all', async (_label, from, to) => {
    await expect(schedulesService.create(body(from, to), ACTOR)).rejects.toBeInstanceOf(BadRequestException);

    expect(fhirClient.read).not.toHaveBeenCalled();
    expect(fhirClient.search).not.toHaveBeenCalled();
    expect(fhirClient.batch).not.toHaveBeenCalled();
  });

  it('should accept a horizon of exactly 90 days', async () => {
    await expect(schedulesService.create(body('2026-11-01', '2027-01-30'), ACTOR)).resolves.toMatchObject({ isActive: true });
  });

  it.each([
    ['practitionerRoleId', 'PractitionerRole'],
    ['roomId', 'Location'],
    ['serviceId', 'HealthcareService'],
  ])('should answer 404 NOT_FOUND naming %s when that resource does not exist, and write nothing', async (field, type) => {
    fhirClient.read.mockImplementation(async (resourceType) => {
      if (resourceType === type) {
        throw new NotFoundException({ errorCode: 'NOT_FOUND', message: 'HAPI: not found' });
      }
      return { resourceType, id: 'x' };
    });

    const attempt = schedulesService.create(body('2026-11-01', '2026-11-30'), ACTOR);

    await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
    await expect(attempt).rejects.toMatchObject({ response: { errorCode: 'NOT_FOUND', message: expect.stringContaining(field) } });
    expect(fhirClient.batch).not.toHaveBeenCalled();
  });

  it('should let another failure of the read through unchanged', async () => {
    const failure = new Error('HAPI down');
    fhirClient.read.mockRejectedValue(failure);

    await expect(schedulesService.create(body('2026-11-01', '2026-11-30'), ACTOR)).rejects.toBe(failure);
  });
});
