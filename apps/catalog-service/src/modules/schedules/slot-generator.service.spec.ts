import { BadRequestException } from '@nestjs/common';
import type { FhirClient, FhirResource } from '@medcenter/fhir';

import { RedisCacheService } from '../cache/redis-cache.service';
import {
  PLANNING_HORIZON_EXT,
  SLOT_DURATION_EXT,
  WEEKLY_WINDOWS_EXT,
} from './schedule.constants';
import { SchedulesService } from './schedules.service';
import { SlotGeneratorService } from './slot-generator.service';

function createFhirClientMock(): jest.Mocked<FhirClient> {
  return {
    search: jest.fn(),
    read: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    batch: jest.fn(),
  } as unknown as jest.Mocked<FhirClient>;
}

function batchResponse(count: number): FhirResource {
  return {
    resourceType: 'Bundle',
    type: 'batch-response',
    entry: Array.from({ length: count }, () => ({
      response: { status: '201 Created' },
    })),
  };
}

describe('SlotGeneratorService', () => {
  let generator: SlotGeneratorService;
  let fhirClient: jest.Mocked<FhirClient>;
  const scheduleId = 'sched-9';

  beforeEach(() => {
    fhirClient = createFhirClientMock();
    generator = new SlotGeneratorService(fhirClient);
    fhirClient.read.mockResolvedValue({
      resourceType: 'Schedule',
      id: scheduleId,
      extension: [
        { url: SLOT_DURATION_EXT, valueInteger: 30 },
        {
          url: WEEKLY_WINDOWS_EXT,
          valueString: JSON.stringify([{ dayOfWeek: 'MO', startTime: '09:00', endTime: '12:00' }]),
        },
      ],
    });
    fhirClient.batch.mockResolvedValue(batchResponse(6));
  });

  it('should not duplicate slots that already exist', async () => {
    // All six planned starts of Monday 2026-11-02 (09:00-12:00, 30 min) already exist.
    const existingStarts = [0, 1, 2, 3, 4, 5].map(
      (i) => new Date(Date.parse('2026-11-02T09:00:00.000Z') + i * 30 * 60_000).toISOString(),
    );
    fhirClient.search.mockResolvedValue({
      entry: existingStarts.map((start, i) => ({
        resource: { resourceType: 'Slot', id: `existing-${i}`, start },
      })),
    });

    const result = await generator.generate(scheduleId, { from: '2026-11-02', to: '2026-11-02' });

    expect(result.generated).toBe(0);
    expect(result.skipped).toBe(6);
    expect(fhirClient.batch).not.toHaveBeenCalled();
  });

  it('should read the slot duration from the valueInteger extension', async () => {
    fhirClient.search.mockResolvedValue({ entry: [] });
    fhirClient.read.mockResolvedValue({
      resourceType: 'Schedule',
      id: scheduleId,
      extension: [
        { url: SLOT_DURATION_EXT, valueInteger: 20 },
        {
          url: WEEKLY_WINDOWS_EXT,
          valueString: JSON.stringify([{ dayOfWeek: 'MO', startTime: '09:00', endTime: '10:00' }]),
        },
      ],
    });

    await generator.generate(scheduleId, { from: '2026-11-02', to: '2026-11-02' });

    const bundle = fhirClient.batch.mock.calls[0][0];
    const starts = (bundle['entry'] as Array<{ resource: { start: string } }>).map(
      (entry) => entry.resource.start,
    );
    // 60-minute window / 20-minute slots = 3 slots at :00 :20 :40.
    expect(starts).toHaveLength(3);
    expect(starts[2]).toBe('2026-11-02T09:40:00.000Z');
  });

  it('should fall back to 30-minute slots when the schedule has neither extension nor legacy field', async () => {
    fhirClient.search.mockResolvedValue({ entry: [] });
    fhirClient.read.mockResolvedValue({
      resourceType: 'Schedule',
      id: scheduleId,
      extension: [
        {
          url: WEEKLY_WINDOWS_EXT,
          valueString: JSON.stringify([{ dayOfWeek: 'MO', startTime: '09:00', endTime: '10:00' }]),
        },
      ],
    });

    await generator.generate(scheduleId, { from: '2026-11-02', to: '2026-11-02' });

    const bundle = fhirClient.batch.mock.calls[0][0];
    expect((bundle['entry'] as unknown[]).length).toBe(2);
  });

  it('should reject a range longer than the 90-day planning horizon', async () => {
    await expect(generator.generate(scheduleId, { from: '2026-01-01', to: '2026-12-31' })).rejects.toThrow(
      'planningHorizon',
    );
    await expect(
      generator.generate(scheduleId, { from: '2026-01-01', to: '2026-12-31' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should generate free slots for an in-range weekly window', async () => {
    fhirClient.search.mockResolvedValue({ entry: [] });

    // 2026-11-02 is a Monday.
    const result = await generator.generate(scheduleId, { from: '2026-11-02', to: '2026-11-02' });

    expect(result.generated).toBe(6);
    expect(result.skipped).toBe(0);
    expect(fhirClient.batch).toHaveBeenCalledTimes(1);
    const bundle = fhirClient.batch.mock.calls[0][0];
    expect(bundle['type']).toBe('batch');
    const entries = bundle['entry'] as Array<{ request: { method: string; url: string } }>;
    expect(entries).toHaveLength(6);
    expect(entries[0]?.request.method).toBe('PUT');
    expect(entries[0]?.request.url).toMatch(/^Slot\//);
  });

  it('should produce FHIR-valid slot ids (no colon, 64 chars max)', async () => {
    fhirClient.search.mockResolvedValue({ entry: [] });

    await generator.generate(scheduleId, { from: '2026-11-02', to: '2026-11-02' });

    const bundle = fhirClient.batch.mock.calls[0][0];
    const ids = (bundle['entry'] as Array<{ resource: { id: string } }>).map(
      (entry) => entry.resource.id,
    );
    expect(ids.length).toBeGreaterThan(0);
    const fhirIdPattern = /^[A-Za-z0-9\-.]{1,64}$/;
    for (const id of ids) {
      expect(id).toMatch(fhirIdPattern);
    }
  });

  it('should derive the same id for the same schedule+start (idempotency key)', async () => {
    fhirClient.search.mockResolvedValue({ entry: [] });

    await generator.generate(scheduleId, { from: '2026-11-02', to: '2026-11-02' });
    const first = (fhirClient.batch.mock.calls[0][0]['entry'] as Array<{ resource: { id: string } }>).map(
      (e) => e.resource.id,
    );

    fhirClient.batch.mockClear();
    await generator.generate(scheduleId, { from: '2026-11-02', to: '2026-11-02' });
    const second = (fhirClient.batch.mock.calls[0][0]['entry'] as Array<{ resource: { id: string } }>).map(
      (e) => e.resource.id,
    );

    expect(second).toEqual(first);
  });

  it('should partially regenerate: skip existing ids, batch only new days', async () => {
    // Monday 2026-11-02 fully generated; range extended to Monday 2026-11-09.
    fhirClient.search
      .mockResolvedValueOnce({
        entry: [
          { resource: { resourceType: 'Slot', id: 'a' } },
          { resource: { resourceType: 'Slot', id: 'b' } },
        ],
      })
      .mockResolvedValueOnce({ entry: [] });
    fhirClient.batch.mockResolvedValue(batchResponse(6));

    const result = await generator.generate(scheduleId, { from: '2026-11-02', to: '2026-11-09' });

    expect(result.generated).toBe(6);
    expect(result.skipped).toBe(6);
    expect(fhirClient.batch).toHaveBeenCalledTimes(1);
  });

  it('should count only 2xx entries from the batch response as generated', async () => {
    fhirClient.search.mockResolvedValue({ entry: [] });
    fhirClient.batch.mockResolvedValue({
      resourceType: 'Bundle',
      type: 'batch-response',
      entry: [
        { response: { status: '201 Created' } },
        { response: { status: '201 Created' } },
        { response: { status: '500 Internal Server Error' } },
      ],
    });

    const result = await generator.generate(scheduleId, { from: '2026-11-02', to: '2026-11-02' });

    expect(result.generated).toBe(2);
  });
});

describe('SchedulesService', () => {
  let schedulesService: SchedulesService;
  let fhirClient: jest.Mocked<FhirClient>;

  beforeEach(() => {
    fhirClient = createFhirClientMock();
    schedulesService = new SchedulesService(fhirClient, new RedisCacheService());
  });

  it('should reject overlapping weekly windows for the same practitioner role', async () => {
    fhirClient.search.mockResolvedValue({ entry: [] });

    await expect(
      schedulesService.create({
        practitionerRoleId: 'role-1',
        roomId: 'room-1',
        serviceId: 'svc-1',
        horizonFrom: '2026-11-01',
        horizonTo: '2026-11-30',
        slotDurationMin: 30,
        windows: [
          { dayOfWeek: 'MO', startTime: '09:00', endTime: '12:00' },
          { dayOfWeek: 'MO', startTime: '11:00', endTime: '13:00' },
        ],
      }),
    ).rejects.toThrow('SCHEDULE_OVERLAP');
  });

  it('should persist a non-overlapping schedule', async () => {
    fhirClient.search.mockResolvedValue({ entry: [] });
    fhirClient.create.mockResolvedValue({ resourceType: 'Schedule', id: 'sched-9' });

    await expect(
      schedulesService.create({
        practitionerRoleId: 'role-1',
        roomId: 'room-1',
        serviceId: 'svc-1',
        horizonFrom: '2026-11-01',
        horizonTo: '2026-11-30',
        slotDurationMin: 30,
        windows: [{ dayOfWeek: 'MO', startTime: '09:00', endTime: '10:00' }],
      }),
    ).resolves.toMatchObject({ resourceType: 'Schedule' });
  });

  it('should persist slotDurationMin as a valueInteger extension, not a top-level element', async () => {
    fhirClient.search.mockResolvedValue({ entry: [] });
    fhirClient.create.mockResolvedValue({ resourceType: 'Schedule', id: 'sched-9' });

    await schedulesService.create({
      practitionerRoleId: 'role-1',
      roomId: 'room-1',
      serviceId: 'svc-1',
      horizonFrom: '2026-11-01',
      horizonTo: '2026-11-30',
      slotDurationMin: 45,
      windows: [{ dayOfWeek: 'MO', startTime: '09:00', endTime: '10:00' }],
    });

    const created = fhirClient.create.mock.calls[0][1];
    // `slotDurationMin` is not a valid FHIR R4 Schedule element: a strict HAPI
    // would reject the whole create. It must live in an extension.
    expect(created['slotDurationMin']).toBeUndefined();
    expect(created['extension']).toContainEqual({ url: SLOT_DURATION_EXT, valueInteger: 45 });
  });

  it('should PATCH slotDurationMin into the extension, not a top-level element', async () => {
    fhirClient.read.mockResolvedValue({
      resourceType: 'Schedule',
      id: 'sched-1',
      slotDurationMin: 30, // legacy top-level write from an older version
      extension: [
        {
          url: WEEKLY_WINDOWS_EXT,
          valueString: JSON.stringify([{ dayOfWeek: 'MO', startTime: '09:00', endTime: '10:00' }]),
        },
      ],
    });
    fhirClient.update.mockResolvedValue({ resourceType: 'Schedule', id: 'sched-1' });

    await schedulesService.update('sched-1', { slotDurationMin: 45 });

    const merged = fhirClient.update.mock.calls[0][2];
    expect(merged['slotDurationMin']).toBeUndefined();
    expect(merged['extension']).toContainEqual({ url: SLOT_DURATION_EXT, valueInteger: 45 });
    // The stored weekly windows survive the duration merge.
    expect(merged['extension']).toContainEqual(
      expect.objectContaining({ valueString: expect.any(String) }),
    );
  });

  it('should carry the stored slot duration over a windows-only PATCH', async () => {
    fhirClient.search.mockResolvedValue({ entry: [] });
    fhirClient.read.mockResolvedValue({
      resourceType: 'Schedule',
      id: 'sched-1',
      extension: [
        { url: SLOT_DURATION_EXT, valueInteger: 45 },
        {
          url: WEEKLY_WINDOWS_EXT,
          valueString: JSON.stringify([{ dayOfWeek: 'MO', startTime: '09:00', endTime: '10:00' }]),
        },
      ],
    });
    fhirClient.update.mockResolvedValue({ resourceType: 'Schedule', id: 'sched-1' });

    await schedulesService.update('sched-1', {
      windows: [{ dayOfWeek: 'TU', startTime: '10:00', endTime: '11:00' }],
    });

    const merged = fhirClient.update.mock.calls[0][2];
    // Replacing the windows must not drop the stored duration extension.
    expect(merged['extension']).toContainEqual({ url: SLOT_DURATION_EXT, valueInteger: 45 });
    expect(merged['extension']).toContainEqual(
      expect.objectContaining({ valueString: expect.any(String) }),
    );
  });

  it('should include the status filter in the slot cache key', async () => {
    fhirClient.search.mockResolvedValue({ entry: [] });
    const cache = (schedulesService as unknown as { cache: RedisCacheService }).cache;
    const getOrLoad = jest.spyOn(cache, 'getOrLoad');

    await schedulesService.listSlots('sched-1', '2026-11-02', '2026-11-03', 'free');
    await schedulesService.listSlots('sched-1', '2026-11-02', '2026-11-03');

    const keys = getOrLoad.mock.calls.map((call) => call[0] as string);
    // The two queries must land on distinct keys: a filtered query must never
    // serve (nor populate) the cache entry of the unfiltered one.
    expect(keys[0]).toBe('slots:sched-1:2026-11-02:2026-11-03:free');
    expect(keys[1]).toBe('slots:sched-1:2026-11-02:2026-11-03:all');
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('should merge horizonFrom/horizonTo into the planningHorizon valuePeriod extension', async () => {
    fhirClient.read.mockResolvedValue({
      resourceType: 'Schedule',
      id: 'sched-1',
      extension: [
        { url: WEEKLY_WINDOWS_EXT, valueString: JSON.stringify([{ dayOfWeek: 'MO', startTime: '09:00', endTime: '10:00' }]) },
        { url: PLANNING_HORIZON_EXT, valuePeriod: { start: '2026-01-01', end: '2026-02-01' } },
      ],
    });
    fhirClient.update.mockResolvedValue({ resourceType: 'Schedule', id: 'sched-1' });

    await schedulesService.update('sched-1', { horizonTo: '2026-03-31' });

    const merged = fhirClient.update.mock.calls[0][2];
    const extensions = merged['extension'] as Array<Record<string, unknown>>;
    const period = extensions.find((ext) => ext['url'] === PLANNING_HORIZON_EXT);
    expect(period).toMatchObject({ valuePeriod: { start: '2026-01-01', end: '2026-03-31' } });
    // Windows valueString extension must survive.
    expect(extensions.some((ext) => 'valueString' in ext)).toBe(true);
  });

  it('should reject a horizon update wider than 90 days', async () => {
    fhirClient.read.mockResolvedValue({ resourceType: 'Schedule', id: 'sched-1' });

    await expect(
      schedulesService.update('sched-1', { horizonFrom: '2026-01-01', horizonTo: '2026-12-31' }),
    ).rejects.toThrow('planningHorizon');
  });

  it('should reject a single-bound PATCH that stretches the stored horizon past 90 days', async () => {
    fhirClient.read.mockResolvedValue({
      resourceType: 'Schedule',
      id: 'sched-1',
      extension: [
        { url: PLANNING_HORIZON_EXT, valuePeriod: { start: '2026-01-01', end: '2026-02-01' } },
      ],
    });

    // Only horizonTo is supplied: the span is measured from the stored start.
    await expect(
      schedulesService.update('sched-1', { horizonTo: '2027-12-31' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fhirClient.update).not.toHaveBeenCalled();
  });

  it('should keep the windows, horizon and duration extensions independent on a comment PATCH', async () => {
    const extension = [
      { url: SLOT_DURATION_EXT, valueInteger: 45 },
      { url: WEEKLY_WINDOWS_EXT, valueString: '[]' },
      { url: PLANNING_HORIZON_EXT, valuePeriod: { start: '2026-01-01', end: '2026-02-01' } },
    ];
    fhirClient.read.mockResolvedValue({ resourceType: 'Schedule', id: 'sched-1', extension });
    fhirClient.update.mockResolvedValue({ resourceType: 'Schedule', id: 'sched-1' });

    await schedulesService.update('sched-1', { comment: 'note' });

    const merged = fhirClient.update.mock.calls[0][2];
    expect(merged['comment']).toBe('note');
    expect(merged['extension']).toEqual(expect.arrayContaining(extension));
    expect(merged['extension']).toHaveLength(3);
  });
});
