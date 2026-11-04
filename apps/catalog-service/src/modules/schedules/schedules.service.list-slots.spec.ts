import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { FhirClient, FhirResource } from '@medcenter/fhir';

import { FHIR_PAGE_SIZE } from '../../common/fhir-search';
import { RedisCacheService } from '../cache/redis-cache.service';
import { SLOT_SEARCH_MAX_PAGES } from '../slots/slot-search';
import { SchedulesService } from './schedules.service';

function slotsOf(count: number, firstIndex = 0): Array<{ resource: FhirResource }> {
  return Array.from({ length: count }, (_, i) => ({
    resource: {
      resourceType: 'Slot',
      id: `slot-${firstIndex + i}`,
      status: 'free',
      start: new Date(Date.parse('2026-11-02T00:00:00Z') + (firstIndex + i) * 60_000).toISOString(),
      end: new Date(Date.parse('2026-11-02T00:00:00Z') + (firstIndex + i + 1) * 60_000).toISOString(),
      schedule: { reference: 'Schedule/sched-1' },
    },
  }));
}

describe('SchedulesService.listSlots', () => {
  let schedulesService: SchedulesService;
  let fhirClient: jest.Mocked<FhirClient>;

  beforeEach(() => {
    fhirClient = {
      read: jest.fn().mockResolvedValue({ resourceType: 'Schedule', id: 'sched-1' }),
      search: jest.fn().mockResolvedValue({ entry: [] }),
    } as unknown as jest.Mocked<FhirClient>;
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

  it('should read every page, so a grid of more than one HAPI page is not cut', async () => {
    fhirClient.search
      .mockResolvedValueOnce({ entry: slotsOf(FHIR_PAGE_SIZE, 0) })
      .mockResolvedValueOnce({ entry: slotsOf(50, FHIR_PAGE_SIZE) });

    const slots = await schedulesService.listSlots('sched-1', '2026-11-02', '2026-11-08');

    expect(slots).toHaveLength(FHIR_PAGE_SIZE + 50);
    expect(fhirClient.search).toHaveBeenCalledTimes(2);
    expect(fhirClient.search).toHaveBeenLastCalledWith('Slot', expect.objectContaining({ _count: FHIR_PAGE_SIZE, _offset: FHIR_PAGE_SIZE, _sort: 'start,_id' }));
  });

  it('should send a date-only bound as the instant of the clinic day (Minsk), not as a bare date', async () => {
    await schedulesService.listSlots('sched-1', '2026-11-02', '2026-11-08');

    expect(fhirClient.search).toHaveBeenCalledWith(
      'Slot',
      expect.objectContaining({ start: ['ge2026-11-01T21:00:00.000Z', 'le2026-11-08T20:59:59.999Z'] }),
    );
  });

  it('should answer 404 for an unknown schedule instead of an empty list', async () => {
    fhirClient.read.mockRejectedValue(new NotFoundException({ errorCode: 'NOT_FOUND', message: 'no such schedule' }));

    await expect(schedulesService.listSlots('nope', '2026-11-02', '2026-11-08')).rejects.toBeInstanceOf(NotFoundException);
    expect(fhirClient.search).not.toHaveBeenCalled();
  });

  it('should answer 400 and not a silently cut list when the page cap is hit', async () => {
    fhirClient.search.mockImplementation(async (_type, params) => ({
      entry: slotsOf(FHIR_PAGE_SIZE, Number((params as { _offset: number })._offset)),
    }));

    await expect(schedulesService.listSlots('sched-1', '2026-11-02', '2026-11-08')).rejects.toBeInstanceOf(BadRequestException);
    expect(fhirClient.search).toHaveBeenCalledTimes(SLOT_SEARCH_MAX_PAGES);
  });
});
