import type { FhirClient, FhirResource } from '@medcenter/fhir';

import { transactionResponder } from '@medcenter/testing';
import { RedisCacheService } from '../cache/redis-cache.service';
import { ACTOR, ONE_DAY, SCHEDULE_ID, generatorFhirMock, scheduleOf } from './__tests__/schedule-fixture';
import { PLANNING_HORIZON_EXT, SLOT_DURATION_EXT, WEEKLY_WINDOWS_EXT } from './schedule.constants';
import { SchedulesService } from './schedules.service';
import { SlotGeneratorService } from './slot-generator.service';

function slot(id: string, start: string, end: string, status = 'free'): { resource: FhirResource } {
  return { resource: { resourceType: 'Slot', id, status, start, end } };
}

function deletedSlotIds(fhirClient: jest.Mocked<FhirClient>): string[] {
  return fhirClient.batch.mock.calls.flatMap(([bundle]) =>
    ((bundle['entry'] ?? []) as Array<{ request: { method: string; url: string } }>)
      .filter((entry) => entry.request.method === 'DELETE')
      .map((entry) => entry.request.url),
  );
}

describe('free slots that no longer match the schedule grid', () => {
  const onGrid = slot('on-grid', '2026-11-02T06:00:00.000Z', '2026-11-02T06:30:00.000Z');
  const offGrid = slot('off-grid', '2026-11-02T06:10:00.000Z', '2026-11-02T06:40:00.000Z');
  const busyOffGrid = slot('busy', '2026-11-02T07:10:00.000Z', '2026-11-02T07:40:00.000Z', 'busy');

  describe('when slots are generated', () => {
    let fhirClient: jest.Mocked<FhirClient>;
    let generator: SlotGeneratorService;

    beforeEach(() => {
      fhirClient = generatorFhirMock();
      generator = new SlotGeneratorService(fhirClient, new RedisCacheService());
    });

    it('should delete a free slot that is not on the grid and keep one that is', async () => {
      fhirClient.search.mockResolvedValueOnce({ entry: [onGrid, offGrid] });

      await generator.generate(SCHEDULE_ID, ONE_DAY, ACTOR);

      expect(deletedSlotIds(fhirClient)).toEqual(['Slot/off-grid']);
    });

    it('should delete a free slot with the grid start but the old length', async () => {
      fhirClient.search.mockResolvedValueOnce({ entry: [slot('long', '2026-11-02T06:00:00.000Z', '2026-11-02T06:45:00.000Z')] });

      await generator.generate(SCHEDULE_ID, ONE_DAY, ACTOR);

      expect(deletedSlotIds(fhirClient)).toEqual(['Slot/long']);
    });

    it('should only ask for free slots, so a busy one is never touched', async () => {
      fhirClient.search.mockResolvedValue({ entry: [] });

      await generator.generate(SCHEDULE_ID, ONE_DAY, ACTOR);

      expect(fhirClient.search.mock.calls[0]?.[1]).toMatchObject({ schedule: `Schedule/${SCHEDULE_ID}`, status: 'free' });
      expect(busyOffGrid.resource['status']).toBe('busy');
    });
  });

  describe('when a schedule is patched', () => {
    let fhirClient: jest.Mocked<FhirClient>;
    let service: SchedulesService;

    beforeEach(() => {
      fhirClient = {
        search: jest.fn().mockResolvedValue({ entry: [] }),
        read: jest.fn().mockResolvedValue({
          resourceType: 'Schedule',
          id: SCHEDULE_ID,
          actor: [{ reference: 'PractitionerRole/role-1' }],
          extension: [
            { url: SLOT_DURATION_EXT, valueInteger: 30 },
            { url: WEEKLY_WINDOWS_EXT, valueString: JSON.stringify([{ dayOfWeek: 'MO', startTime: '09:00', endTime: '12:00' }]) },
            { url: PLANNING_HORIZON_EXT, valuePeriod: { start: '2026-11-02', end: '2026-11-02' } },
          ],
        }),
        batch: jest.fn().mockImplementation(transactionResponder()),
      } as unknown as jest.Mocked<FhirClient>;
      service = new SchedulesService(fhirClient, new RedisCacheService());
    });

    it('should delete the free slots of the old duration when the duration changes', async () => {
      fhirClient.search.mockImplementation(async (type: string) =>
        type === 'Slot' ? { entry: [onGrid, offGrid] } : { entry: [] },
      );

      await service.update(SCHEDULE_ID, { slotDurationMin: 20 }, ACTOR);

      expect(deletedSlotIds(fhirClient)).toEqual(['Slot/on-grid', 'Slot/off-grid']);
    });

    it('should delete free slots that fall outside the shrunk horizon', async () => {
      fhirClient.search.mockImplementation(async (type: string) =>
        type === 'Slot' ? { entry: [onGrid, slot('later', '2026-11-09T06:00:00.000Z', '2026-11-09T06:30:00.000Z')] } : { entry: [] },
      );
      fhirClient.read.mockResolvedValueOnce(scheduleOf(
        [{ dayOfWeek: 'MO', startTime: '09:00', endTime: '12:00' }], 30, { start: '2026-11-02', end: '2026-11-09' },
      ));

      await service.update(SCHEDULE_ID, { horizonTo: '2026-11-02' }, ACTOR);

      expect(deletedSlotIds(fhirClient)).toEqual(['Slot/later']);
    });

    it('should not look at slots when only the comment changes', async () => {
      await service.update(SCHEDULE_ID, { comment: 'note' }, ACTOR);

      expect(fhirClient.search).not.toHaveBeenCalledWith('Slot', expect.anything());
    });
  });
});
