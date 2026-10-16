import type { FhirClient } from '@medcenter/fhir';

import { RedisCacheService } from '../cache/redis-cache.service';
import { SchedulesService } from './schedules.service';

describe('SchedulesService.listSlots', () => {
  let schedulesService: SchedulesService;
  let fhirClient: jest.Mocked<FhirClient>;

  beforeEach(() => {
    fhirClient = { search: jest.fn().mockResolvedValue({ entry: [] }) } as unknown as jest.Mocked<FhirClient>;
    schedulesService = new SchedulesService(fhirClient, new RedisCacheService());
  });

  it('should search free and busy slots only when no status is given, so retired slots are not shown as free', async () => {
    await schedulesService.listSlots('sched-1', '2026-11-02', '2026-11-03');

    expect(fhirClient.search).toHaveBeenCalledWith('Slot', expect.objectContaining({ status: 'free,busy' }));
  });

  it('should search the requested status when a slot retired by a schedule removal is asked for', async () => {
    fhirClient.search.mockResolvedValue({
      entry: [{ resource: { resourceType: 'Slot', id: 'x', status: 'entered-in-error', schedule: { reference: 'Schedule/sched-1' } } }],
    });

    const slots = await schedulesService.listSlots('sched-1', '2026-11-02', '2026-11-03', 'entered-in-error');

    expect(fhirClient.search).toHaveBeenCalledWith('Slot', expect.objectContaining({ status: 'entered-in-error' }));
    expect(slots.map((slot) => slot.status)).toEqual(['entered-in-error']);
  });
});
