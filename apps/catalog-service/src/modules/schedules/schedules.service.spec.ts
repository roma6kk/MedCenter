import { BadRequestException } from '@nestjs/common';
import type { FhirClient } from '@medcenter/fhir';

import { RedisCacheService } from '../cache/redis-cache.service';
import {
  PLANNING_HORIZON_EXT,
  SLOT_DURATION_EXT,
  WEEKLY_WINDOWS_EXT,
} from './schedule.constants';
import { SchedulesService } from './schedules.service';

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
    ).resolves.toMatchObject({ id: 'sched-9', isActive: true });
  });

  it('should answer with the ScheduleSummaryDto, not the raw FHIR resource, when a schedule is created', async () => {
    fhirClient.search.mockResolvedValue({ entry: [] });
    fhirClient.create.mockImplementation(async (_type, resource) => ({ ...resource, id: 'sched-9' }));

    const created = await schedulesService.create({
      practitionerRoleId: 'role-1',
      roomId: '1469',
      serviceId: '1470',
      horizonFrom: '2026-12-19',
      horizonTo: '2026-12-26',
      slotDurationMin: 30,
      windows: [{ dayOfWeek: 'SA', startTime: '09:00', endTime: '12:00' }],
    });

    expect(created).toEqual({
      id: 'sched-9',
      isActive: true,
      practitionerRoleId: 'role-1',
      roomId: '1469',
      serviceId: '1470',
      horizonFrom: '2026-12-19',
      horizonTo: '2026-12-26',
      slotDurationMin: 30,
      windows: [{ dayOfWeek: 'SA', startTime: '09:00', endTime: '12:00' }],
    });
    expect(created).not.toHaveProperty('resourceType');
  });

  it('should list schedules as a page with the accurate total and the requested window', async () => {
    fhirClient.search.mockResolvedValue({ total: 45, entry: [{ resource: { resourceType: 'Schedule', id: 's-1', active: true } }] });

    const page = await schedulesService.list(2, 20, 'role-1', 'true');

    expect(fhirClient.search).toHaveBeenCalledWith('Schedule', {
      actor: 'PractitionerRole/role-1',
      active: 'true',
      _sort: '_id',
      _count: 20,
      _offset: 20,
      _total: 'accurate',
    });
    expect(page.meta).toEqual({ page: 2, pageSize: 20, totalItems: 45, totalPages: 3 });
    expect(page.items.map((item) => item.id)).toEqual(['s-1']);
  });

  it('should re-check the overlap with the merged horizon when only the horizon is patched', async () => {
    fhirClient.read.mockResolvedValue({
      resourceType: 'Schedule',
      id: 'sched-1',
      actor: [{ reference: 'PractitionerRole/role-1' }],
      extension: [
        { url: WEEKLY_WINDOWS_EXT, valueString: JSON.stringify([{ dayOfWeek: 'MO', startTime: '09:00', endTime: '12:00' }]) },
        { url: PLANNING_HORIZON_EXT, valuePeriod: { start: '2026-11-01', end: '2026-11-30' } },
      ],
    });
    fhirClient.search.mockResolvedValue({
      entry: [
        {
          resource: {
            resourceType: 'Schedule',
            id: 'sched-2',
            extension: [
              { url: WEEKLY_WINDOWS_EXT, valueString: JSON.stringify([{ dayOfWeek: 'MO', startTime: '10:00', endTime: '11:00' }]) },
              { url: PLANNING_HORIZON_EXT, valuePeriod: { start: '2026-12-01', end: '2026-12-31' } },
            ],
          },
        },
      ],
    });

    await expect(schedulesService.update('sched-1', { horizonTo: '2026-12-15' })).rejects.toThrow('SCHEDULE_OVERLAP');
    expect(fhirClient.update).not.toHaveBeenCalled();
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
    fhirClient.search.mockResolvedValue({ entry: [] });
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
