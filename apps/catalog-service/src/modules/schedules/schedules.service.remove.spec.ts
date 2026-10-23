import { ConflictException } from '@nestjs/common';
import { ERROR_CODES } from '@medcenter/contracts';
import type { FhirClient } from '@medcenter/fhir';

import { RedisCacheService } from '../cache/redis-cache.service';
import { SchedulesService } from './schedules.service';

const SCHEDULE_ID = 'sched-1';
const ACTOR = { sub: 'admin-1', requestId: 'req-1' };
const TRANSACTION_DONE = { resourceType: 'Bundle', type: 'transaction-response', entry: [{ response: { status: '200 OK' } }, { response: { status: '201 Created' } }] };

/** Methods and URLs of the last transaction (the schedule's own change and its AuditEvent). */
function entriesOf(fhir: jest.Mocked<FhirClient>): Array<{ method: string; url: string }> {
  const bundle = fhir.batch.mock.calls.at(-1)?.[0] as unknown as { entry: Array<{ request: { method: string; url: string } }> };
  return bundle.entry.map((entry) => ({ method: entry.request.method, url: entry.request.url }));
}

describe('SchedulesService.remove', () => {
  let schedulesService: SchedulesService;
  let fhirClient: jest.Mocked<FhirClient>;
  let cache: RedisCacheService;

  beforeEach(() => {
    fhirClient = {
      search: jest.fn().mockResolvedValue({ entry: [] }),
      read: jest.fn().mockResolvedValue({ resourceType: 'Schedule', id: SCHEDULE_ID, active: true }),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      batch: jest.fn().mockResolvedValue(TRANSACTION_DONE),
    } as unknown as jest.Mocked<FhirClient>;
    cache = new RedisCacheService();
    schedulesService = new SchedulesService(fhirClient, cache);
  });

  it('should delete the schedule and drop its cached slot pages when it has no slots', async () => {
    const invalidate = jest.spyOn(cache, 'invalidate');

    await schedulesService.remove(SCHEDULE_ID, false, ACTOR);

    expect(entriesOf(fhirClient)).toEqual([
      { method: 'DELETE', url: `Schedule/${SCHEDULE_ID}` },
      { method: 'POST', url: 'AuditEvent' },
    ]);
    expect(invalidate).toHaveBeenCalledWith([`slots:${SCHEDULE_ID}:`, 'catalog:doctor-slots:']);
  });

  it('should refuse with a catalogued SCHEDULE_IN_USE and keep the cache and the schedule when a slot is busy', async () => {
    fhirClient.search.mockResolvedValue({ entry: [{ resource: { resourceType: 'Slot', status: 'busy' } }] });
    const invalidate = jest.spyOn(cache, 'invalidate');

    const refusal = await schedulesService.remove(SCHEDULE_ID, true, ACTOR).then(
      () => undefined,
      (reason: unknown) => reason,
    );

    expect(refusal).toBeInstanceOf(ConflictException);
    const { errorCode } = (refusal as ConflictException).getResponse() as { errorCode: string };
    expect(ERROR_CODES).toContain(errorCode);
    expect(errorCode).toBe('SCHEDULE_IN_USE');
    expect(fhirClient.batch).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('should drop the cached slot pages when the schedule is deactivated because retired slots remain', async () => {
    fhirClient.search.mockImplementation(async (_type, params) => ({
      entry: params?.['status'] === undefined ? [{ resource: { resourceType: 'Slot', id: 'x', status: 'entered-in-error' } }] : [],
    }));
    fhirClient.read.mockResolvedValue({ resourceType: 'Schedule', id: SCHEDULE_ID, active: true });
    const invalidate = jest.spyOn(cache, 'invalidate');

    await schedulesService.remove(SCHEDULE_ID, true, ACTOR);

    expect(entriesOf(fhirClient)).toEqual([
      { method: 'PUT', url: `Schedule/${SCHEDULE_ID}` },
      { method: 'POST', url: 'AuditEvent' },
    ]);
    expect(invalidate).toHaveBeenCalledWith([`slots:${SCHEDULE_ID}:`, 'catalog:doctor-slots:']);
  });
});
