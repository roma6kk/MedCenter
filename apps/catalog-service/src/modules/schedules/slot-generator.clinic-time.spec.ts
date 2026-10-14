import { Logger } from '@nestjs/common';
import type { FhirClient, FhirResource } from '@medcenter/fhir';

import { slotLabel } from '../slots/clinic-time';
import { RedisCacheService } from '../cache/redis-cache.service';
import { SLOT_DURATION_EXT, WEEKLY_WINDOWS_EXT } from './schedule.constants';
import { batchResponseFor } from './__tests__/batch-echo';
import { SlotGeneratorService } from './slot-generator.service';

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

/**
 * API §5.2.1 gives windows in clinic time. These tests pin the generator to the
 * zone the doctor and patient screens label slots in (Europe/Minsk, UTC+3), so
 * a window the admin saw as 09:00 is never shown as 12:00.
 */
describe('SlotGeneratorService clinic time', () => {
  it('should place a 09:00 window at 06:00Z when the slots are generated', async () => {
    // Arrange
    const fhirClient = createFhirClientMock(scheduleOf([{ dayOfWeek: 'MO', startTime: '09:00', endTime: '10:00' }]));
    const generator = new SlotGeneratorService(fhirClient, new RedisCacheService());

    // Act
    await generator.generate(SCHEDULE_ID, { from: '2026-11-02', to: '2026-11-02' });

    // Assert
    expect(generatedSlots(fhirClient).map((slot) => slot.start)).toEqual([
      '2026-11-02T06:00:00.000Z',
      '2026-11-02T06:30:00.000Z',
    ]);
  });

  it('should label the first generated slot with the window start when the doctor schedule renders it', async () => {
    // Arrange
    const fhirClient = createFhirClientMock(scheduleOf([{ dayOfWeek: 'MO', startTime: '09:00', endTime: '10:00' }]));
    const generator = new SlotGeneratorService(fhirClient, new RedisCacheService());

    // Act
    await generator.generate(SCHEDULE_ID, { from: '2026-11-02', to: '2026-11-02' });
    const [first] = generatedSlots(fhirClient);

    // Assert — window 09:00 -> generated instant -> `DoctorScheduleView` label.
    expect(slotLabel({ start: first?.start ?? '', end: first?.end ?? '', status: 'free' })).toBe(
      '02.11.2026 09:00–09:30 · свободен',
    );
  });

  it('should use the clinic weekday when a window starts just after local midnight', async () => {
    // Arrange — Monday 00:30 in Minsk is Sunday 21:30Z.
    const fhirClient = createFhirClientMock(scheduleOf([{ dayOfWeek: 'MO', startTime: '00:30', endTime: '01:00' }]));
    const generator = new SlotGeneratorService(fhirClient, new RedisCacheService());

    // Act
    await generator.generate(SCHEDULE_ID, { from: '2026-11-02', to: '2026-11-02' });

    // Assert
    expect(generatedSlots(fhirClient).map((slot) => slot.start)).toEqual(['2026-11-01T21:30:00.000Z']);
  });

  it('should keep a late window on its clinic day when it ends after 21:00Z', async () => {
    // Arrange — Monday 23:00-23:30 in Minsk is Monday 20:00Z-20:30Z.
    const fhirClient = createFhirClientMock(scheduleOf([{ dayOfWeek: 'MO', startTime: '23:00', endTime: '23:30' }]));
    const generator = new SlotGeneratorService(fhirClient, new RedisCacheService());

    // Act
    await generator.generate(SCHEDULE_ID, { from: '2026-11-02', to: '2026-11-02' });

    // Assert
    expect(generatedSlots(fhirClient).map((slot) => slot.start)).toEqual(['2026-11-02T20:00:00.000Z']);
  });

  it('should not shift the window in summer when the clinic has no daylight saving', async () => {
    // Arrange — 2026-07-06 is a Monday.
    const fhirClient = createFhirClientMock(scheduleOf([{ dayOfWeek: 'MO', startTime: '09:00', endTime: '09:30' }]));
    const generator = new SlotGeneratorService(fhirClient, new RedisCacheService());

    // Act
    await generator.generate(SCHEDULE_ID, { from: '2026-07-06', to: '2026-07-06' });

    // Assert
    expect(generatedSlots(fhirClient).map((slot) => slot.start)).toEqual(['2026-07-06T06:00:00.000Z']);
  });

  it('should search for existing slots between the clinic-day instants when the range is dates', async () => {
    // Arrange
    const fhirClient = createFhirClientMock(scheduleOf([{ dayOfWeek: 'MO', startTime: '09:00', endTime: '10:00' }]));
    const generator = new SlotGeneratorService(fhirClient, new RedisCacheService());

    // Act
    await generator.generate(SCHEDULE_ID, { from: '2026-11-02', to: '2026-11-09' });

    // Assert — the same days the windows were expanded for; a bare date would be read in HAPI's zone.
    expect(fhirClient.search).toHaveBeenCalledWith(
      'Slot',
      expect.objectContaining({
        schedule: `Schedule/${SCHEDULE_ID}`,
        start: ['ge2026-11-01T21:00:00.000Z', 'le2026-11-09T20:59:59.999Z'],
      }),
    );
  });

  it('should skip a booked slot when its start already exists inside the range', async () => {
    // Arrange — the 09:00 slot is busy; it must not be rewritten as free.
    const fhirClient = createFhirClientMock(scheduleOf([{ dayOfWeek: 'MO', startTime: '09:00', endTime: '10:00' }]));
    fhirClient.search.mockResolvedValue({
      entry: [{ resource: { resourceType: 'Slot', id: 'busy-1', status: 'busy', start: '2026-11-02T09:00:00+03:00' } }],
    });
    const generator = new SlotGeneratorService(fhirClient, new RedisCacheService());

    // Act
    await generator.generate(SCHEDULE_ID, { from: '2026-11-02', to: '2026-11-02' });

    // Assert — only 09:30 is new; the stored offset spelling still matches the planned instant.
    expect(generatedSlots(fhirClient).map((slot) => slot.start)).toEqual(['2026-11-02T06:30:00.000Z']);
  });

  it('should generate nothing when the stored slot duration is not positive', async () => {
    // Arrange
    const fhirClient = createFhirClientMock(scheduleOf([{ dayOfWeek: 'MO', startTime: '09:00', endTime: '10:00' }], 0));
    const generator = new SlotGeneratorService(fhirClient, new RedisCacheService());

    // Act
    const result = await generator.generate(SCHEDULE_ID, { from: '2026-11-02', to: '2026-11-02' });

    // Assert
    expect(result).toEqual({ generated: 0, skipped: 0 });
    expect(fhirClient.batch).not.toHaveBeenCalled();
  });
});

/** Starts of the 30-minute slots from `firstStart`, as a HAPI search result of existing slots. */
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

/**
 * Contract with `tools/demo-seed`: the seed stores weekly windows as clinic wall-clock
 * time (`09:00`) and fills the slots at the instants this generator plans, so a later
 * `generate` finds them and skips them. Windows in any other zone double the day.
 */
describe('SlotGeneratorService and the demo seed', () => {
  const MONDAY = { from: '2026-10-19', to: '2026-10-19' };
  const SEEDED_WINDOWS = ['MO', 'TU', 'WE', 'TH', 'FR'].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '13:00' }));

  it('should skip every slot the seed stored when the schedule windows are in clinic time', async () => {
    // Arrange — 09:00-13:00 in Minsk is eight slots from 06:00Z to 09:30Z.
    const fhirClient = createFhirClientMock(scheduleOf(SEEDED_WINDOWS));
    fhirClient.search.mockResolvedValue(existingSlots('2026-10-19T06:00:00.000Z', 8));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const generator = new SlotGeneratorService(fhirClient, new RedisCacheService());

    // Act
    const result = await generator.generate(SCHEDULE_ID, MONDAY);

    // Assert — nothing new is written and nothing looks wrong.
    expect(result).toEqual({ generated: 0, skipped: 8 });
    expect(fhirClient.batch).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('should warn about the slots its windows do not plan when stored windows still read as UTC', async () => {
    // Arrange — the shape the live HAPI held before the seed moved to clinic time:
    // 06:00-10:00 here is 03:00Z-07:00Z, next to slots that sit at 06:00Z-09:30Z.
    const legacyWindows = SEEDED_WINDOWS.map((window) => ({ ...window, startTime: '06:00', endTime: '10:00' }));
    const fhirClient = createFhirClientMock(scheduleOf(legacyWindows));
    fhirClient.search.mockResolvedValue(existingSlots('2026-10-19T06:00:00.000Z', 8));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const generator = new SlotGeneratorService(fhirClient, new RedisCacheService());

    // Act
    const result = await generator.generate(SCHEDULE_ID, MONDAY);

    // Assert — the day does grow (03:00Z-05:30Z are new), so the log has to say why.
    expect(result).toEqual({ generated: 6, skipped: 2 });
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ scheduleId: SCHEDULE_ID, unplanned: 6, existing: 8 }),
      expect.stringContaining('do not plan'),
    );
    warn.mockRestore();
  });
});
