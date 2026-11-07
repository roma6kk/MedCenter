import { Logger } from '@nestjs/common';
import type { FhirClient, FhirResource } from '@medcenter/fhir';

import { slotLabel } from '../slots/clinic-time';
import { RedisCacheService } from '../cache/redis-cache.service';
import { SLOT_DURATION_EXT, WEEKLY_WINDOWS_EXT } from './schedule.constants';
import { batchResponseFor } from './__tests__/batch-echo';
import { SlotGeneratorService } from './slot-generator.service';

const ACTOR = { sub: 'admin-1', requestId: 'req-1' };

const SCHEDULE_ID = 'sched-9';

interface Window {
  readonly dayOfWeek: string;
  readonly startTime: string;
  readonly endTime: string;
}

function scheduleOf(windows: readonly Window[], durationMin = 30): FhirResource {
  return {
    resourceType: 'Schedule',
    id: SCHEDULE_ID,
    extension: [
      { url: SLOT_DURATION_EXT, valueInteger: durationMin },
      { url: WEEKLY_WINDOWS_EXT, valueString: JSON.stringify(windows) },
    ],
  };
}

function createFhirClientMock(schedule: FhirResource): jest.Mocked<FhirClient> {
  const fhirClient = {
    read: jest.fn().mockResolvedValue(schedule),
    search: jest.fn().mockResolvedValue({ entry: [] }),
    batch: jest.fn().mockImplementation(async (bundle: FhirResource) => batchResponseFor(bundle)),
  } as unknown as jest.Mocked<FhirClient>;
  return fhirClient;
}

function generatedSlots(fhirClient: jest.Mocked<FhirClient>): Array<{ start: string; end: string }> {
  return fhirClient.batch.mock.calls.flatMap(([bundle]) =>
    (bundle['entry'] as Array<{ resource: { start: string; end: string } }>).map((entry) => entry.resource),
  );
}

describe('SlotGeneratorService clinic time', () => {
  it('should place a 09:00 window at 06:00Z when the slots are generated', async () => {
    const fhirClient = createFhirClientMock(scheduleOf([{ dayOfWeek: 'MO', startTime: '09:00', endTime: '10:00' }]));
    const generator = new SlotGeneratorService(fhirClient, new RedisCacheService());

    await generator.generate(SCHEDULE_ID, { from: '2026-11-02', to: '2026-11-02' }, ACTOR);

    expect(generatedSlots(fhirClient).map((slot) => slot.start)).toEqual([
      '2026-11-02T06:00:00.000Z',
      '2026-11-02T06:30:00.000Z',
    ]);
  });

  it('should label the first generated slot with the window start when the doctor schedule renders it', async () => {
    const fhirClient = createFhirClientMock(scheduleOf([{ dayOfWeek: 'MO', startTime: '09:00', endTime: '10:00' }]));
    const generator = new SlotGeneratorService(fhirClient, new RedisCacheService());

    await generator.generate(SCHEDULE_ID, { from: '2026-11-02', to: '2026-11-02' }, ACTOR);
    const [first] = generatedSlots(fhirClient);

    expect(slotLabel({ start: first?.start ?? '', end: first?.end ?? '', status: 'free' })).toBe(
      '02.11.2026 09:00–09:30 · свободен',
    );
  });

  it('should use the clinic weekday when a window starts just after local midnight', async () => {
    const fhirClient = createFhirClientMock(scheduleOf([{ dayOfWeek: 'MO', startTime: '00:30', endTime: '01:00' }]));
    const generator = new SlotGeneratorService(fhirClient, new RedisCacheService());

    await generator.generate(SCHEDULE_ID, { from: '2026-11-02', to: '2026-11-02' }, ACTOR);

    expect(generatedSlots(fhirClient).map((slot) => slot.start)).toEqual(['2026-11-01T21:30:00.000Z']);
  });

  it('should keep a late window on its clinic day when it ends after 21:00Z', async () => {
    const fhirClient = createFhirClientMock(scheduleOf([{ dayOfWeek: 'MO', startTime: '23:00', endTime: '23:30' }]));
    const generator = new SlotGeneratorService(fhirClient, new RedisCacheService());

    await generator.generate(SCHEDULE_ID, { from: '2026-11-02', to: '2026-11-02' }, ACTOR);

    expect(generatedSlots(fhirClient).map((slot) => slot.start)).toEqual(['2026-11-02T20:00:00.000Z']);
  });

  it('should not shift the window in summer when the clinic has no daylight saving', async () => {
    const fhirClient = createFhirClientMock(scheduleOf([{ dayOfWeek: 'MO', startTime: '09:00', endTime: '09:30' }]));
    const generator = new SlotGeneratorService(fhirClient, new RedisCacheService());

    await generator.generate(SCHEDULE_ID, { from: '2026-07-06', to: '2026-07-06' }, ACTOR);

    expect(generatedSlots(fhirClient).map((slot) => slot.start)).toEqual(['2026-07-06T06:00:00.000Z']);
  });

  it('should search for existing slots between the clinic-day instants when the range is dates', async () => {
    const fhirClient = createFhirClientMock(scheduleOf([{ dayOfWeek: 'MO', startTime: '09:00', endTime: '10:00' }]));
    const generator = new SlotGeneratorService(fhirClient, new RedisCacheService());

    await generator.generate(SCHEDULE_ID, { from: '2026-11-02', to: '2026-11-09' }, ACTOR);

    expect(fhirClient.search).toHaveBeenCalledWith(
      'Slot',
      expect.objectContaining({
        schedule: `Schedule/${SCHEDULE_ID}`,
        start: ['ge2026-11-01T21:00:00.000Z', 'le2026-11-09T20:59:59.999Z'],
      }),
    );
  });

  it('should skip a booked slot when its start already exists inside the range', async () => {
    const fhirClient = createFhirClientMock(scheduleOf([{ dayOfWeek: 'MO', startTime: '09:00', endTime: '10:00' }]));
    fhirClient.search.mockResolvedValue({
      entry: [{ resource: { resourceType: 'Slot', id: 'busy-1', status: 'busy', start: '2026-11-02T09:00:00+03:00' } }],
    });
    const generator = new SlotGeneratorService(fhirClient, new RedisCacheService());

    await generator.generate(SCHEDULE_ID, { from: '2026-11-02', to: '2026-11-02' }, ACTOR);

    expect(generatedSlots(fhirClient).map((slot) => slot.start)).toEqual(['2026-11-02T06:30:00.000Z']);
  });

  it('should generate nothing when the stored slot duration is not positive', async () => {
    const fhirClient = createFhirClientMock(scheduleOf([{ dayOfWeek: 'MO', startTime: '09:00', endTime: '10:00' }], 0));
    const generator = new SlotGeneratorService(fhirClient, new RedisCacheService());

    const result = await generator.generate(SCHEDULE_ID, { from: '2026-11-02', to: '2026-11-02' }, ACTOR);

    expect(result).toEqual({ generated: 0, skipped: 0 });
    expect(fhirClient.batch).not.toHaveBeenCalled();
  });
});

function existingSlots(firstStart: string, count: number): { entry: Array<{ resource: FhirResource }> } {
  return {
    entry: Array.from({ length: count }, (_, index) => ({
      resource: {
        resourceType: 'Slot',
        id: `existing-${index}`,
        status: 'free',
        start: new Date(Date.parse(firstStart) + index * 30 * 60_000).toISOString(),
      },
    })),
  };
}

describe('SlotGeneratorService and the demo seed', () => {
  const MONDAY = { from: '2026-10-19', to: '2026-10-19' };
  const SEEDED_WINDOWS = ['MO', 'TU', 'WE', 'TH', 'FR'].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '13:00' }));

  it('should skip every slot the seed stored when the schedule windows are in clinic time', async () => {
    const fhirClient = createFhirClientMock(scheduleOf(SEEDED_WINDOWS));
    fhirClient.search.mockResolvedValue(existingSlots('2026-10-19T06:00:00.000Z', 8));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const generator = new SlotGeneratorService(fhirClient, new RedisCacheService());

    const result = await generator.generate(SCHEDULE_ID, MONDAY, ACTOR);

    expect(result).toEqual({ generated: 0, skipped: 8 });
    expect(fhirClient.batch).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('should warn about the slots its windows do not plan when stored windows still read as UTC', async () => {
    const legacyWindows = SEEDED_WINDOWS.map((window) => ({ ...window, startTime: '06:00', endTime: '10:00' }));
    const fhirClient = createFhirClientMock(scheduleOf(legacyWindows));
    fhirClient.search.mockResolvedValue(existingSlots('2026-10-19T06:00:00.000Z', 8));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const generator = new SlotGeneratorService(fhirClient, new RedisCacheService());

    const result = await generator.generate(SCHEDULE_ID, MONDAY, ACTOR);

    expect(result).toEqual({ generated: 6, skipped: 2 });
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ scheduleId: SCHEDULE_ID, unplanned: 6, existing: 8 }),
      expect.stringContaining('do not plan'),
    );
    warn.mockRestore();
  });
});
