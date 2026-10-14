import { FhirClientError, type FhirClient, type FhirSearchResult } from '@medcenter/fhir';
import { MEDCENTER_EXT } from '@medcenter/terminology';

import { MAX_USAGE_SLOTS, RoomUsageService } from './room-usage.service';

const ROOM_ID = 'room-204';
const NOW = Date.parse('2026-11-01T06:00:00.000Z');

type Json = Record<string, unknown>;

function bundle(resources: readonly Json[]): FhirSearchResult {
  return { entry: resources.map((resource) => ({ resource: { resourceType: 'Unknown', ...resource } })) };
}

function bookedSlot(id: string, start: string, end: string): Json {
  return { resourceType: 'Slot', id, status: 'busy', start, end, schedule: { reference: 'Schedule/sched-1' } };
}

const SCHEDULE: Json = {
  resourceType: 'Schedule',
  id: 'sched-1',
  active: true,
  actor: [
    { reference: 'PractitionerRole/role-7' },
    { reference: `Location/${ROOM_ID}` },
    { reference: 'HealthcareService/svc-1' },
  ],
  extension: [
    { url: MEDCENTER_EXT.SCHEDULE_PLANNING_HORIZON, valuePeriod: { start: '2026-11-01', end: '2026-11-30' } },
  ],
};

const INCLUDED: readonly Json[] = [
  { resourceType: 'PractitionerRole', id: 'role-7', practitioner: { reference: 'Practitioner/prac-1' } },
  { resourceType: 'Practitioner', id: 'prac-1', name: [{ family: 'Иванов', given: ['Иван'] }] },
  { resourceType: 'HealthcareService', id: 'svc-1', name: 'Консультация терапевта' },
  { resourceType: 'Location', id: ROOM_ID, name: 'Кабинет 204' },
];

function createFhirClientMock(schedules: readonly Json[], slots: readonly Json[]): jest.Mocked<FhirClient> {
  const fhirClient = { read: jest.fn(), search: jest.fn() } as unknown as jest.Mocked<FhirClient>;
  fhirClient.read.mockResolvedValue({ resourceType: 'Location', id: ROOM_ID });
  fhirClient.search.mockImplementation(async (resourceType) =>
    resourceType === 'Schedule' ? bundle(schedules) : bundle(slots),
  );
  return fhirClient;
}

function searchOf(fhirClient: jest.Mocked<FhirClient>, resourceType: string): Json | undefined {
  return fhirClient.search.mock.calls.find(([type]) => type === resourceType)?.[1];
}

describe('RoomUsageService', () => {
  const slots = [bookedSlot('slot-1', '2026-11-02T09:00:00.000Z', '2026-11-02T09:30:00.000Z')];

  it('should list the referencing schedule and its upcoming booked slots when the room is in use', async () => {
    // Arrange
    const service = new RoomUsageService(createFhirClientMock([SCHEDULE, ...INCLUDED], slots));

    // Act
    const usage = await service.usage(ROOM_ID, NOW);

    // Assert
    expect(usage).toEqual({
      roomId: ROOM_ID,
      inUse: true,
      truncated: false,
      items: [
        {
          resourceType: 'Schedule',
          id: 'sched-1',
          isActive: true,
          display: 'Иванов Иван · Консультация терапевта · 01.11.2026–30.11.2026 · активно',
        },
        {
          resourceType: 'Slot',
          id: 'slot-1',
          scheduleId: 'sched-1',
          start: '2026-11-02T09:00:00.000Z',
          end: '2026-11-02T09:30:00.000Z',
          display: '02.11.2026 12:00–12:30 · запись · Иванов Иван',
        },
      ],
    });
  });

  it('should find schedules through Schedule.actor, the R4 search parameter that holds the room', async () => {
    // Arrange
    const fhirClient = createFhirClientMock([SCHEDULE], slots);
    const service = new RoomUsageService(fhirClient);

    // Act
    await service.usage(ROOM_ID, NOW);

    // Assert — R4 Schedule has no `location` search parameter; HAPI answers 400 to it.
    expect(searchOf(fhirClient, 'Schedule')).toMatchObject({
      actor: `Location/${ROOM_ID}`,
      _include: 'Schedule:actor',
      '_include:iterate': 'PractitionerRole:practitioner',
    });
    expect(searchOf(fhirClient, 'Schedule')).not.toHaveProperty('location');
  });

  it('should search only booked slots of those schedules that start from now on when it looks for bookings', async () => {
    // Arrange
    const fhirClient = createFhirClientMock([SCHEDULE, { ...SCHEDULE, id: 'sched-2', active: false }], slots);
    const service = new RoomUsageService(fhirClient);

    // Act
    await service.usage(ROOM_ID, NOW);

    // Assert
    expect(searchOf(fhirClient, 'Slot')).toEqual({
      schedule: 'Schedule/sched-1,Schedule/sched-2',
      status: 'busy',
      start: 'ge2026-11-01T06:00:00.000Z',
      _sort: 'start',
      _count: MAX_USAGE_SLOTS + 1,
    });
  });

  it('should keep an inactive schedule in the list when it still references the room', async () => {
    // Arrange
    const inactive = { ...SCHEDULE, active: false, extension: [] };
    const service = new RoomUsageService(createFhirClientMock([inactive], []));

    // Act
    const usage = await service.usage(ROOM_ID, NOW);

    // Assert — any referencing Schedule blocks DELETE (HAPI referential integrity).
    expect(usage.inUse).toBe(true);
    expect(usage.items).toEqual([
      { resourceType: 'Schedule', id: 'sched-1', isActive: false, display: 'PractitionerRole/role-7 · неактивно' },
    ]);
  });

  it('should report a free room without a Slot search when no schedule references it', async () => {
    // Arrange
    const fhirClient = createFhirClientMock([], slots);
    const service = new RoomUsageService(fhirClient);

    // Act
    const usage = await service.usage(ROOM_ID, NOW);

    // Assert
    expect(usage).toEqual({ roomId: ROOM_ID, inUse: false, truncated: false, items: [] });
    expect(searchOf(fhirClient, 'Slot')).toBeUndefined();
  });

  it('should cap the booked slots and flag truncation when more bookings exist than the cap', async () => {
    // Arrange
    const many = Array.from({ length: MAX_USAGE_SLOTS + 1 }, (_, index) =>
      bookedSlot(`slot-${index}`, '2026-11-02T09:00:00.000Z', '2026-11-02T09:30:00.000Z'),
    );
    const service = new RoomUsageService(createFhirClientMock([SCHEDULE], many));

    // Act
    const usage = await service.usage(ROOM_ID, NOW);

    // Assert
    expect(usage.truncated).toBe(true);
    expect(usage.items.filter((item) => item.resourceType === 'Slot')).toHaveLength(MAX_USAGE_SLOTS);
  });

  it('should answer 404 without searching when the room does not exist', async () => {
    // Arrange
    const fhirClient = createFhirClientMock([SCHEDULE], slots);
    fhirClient.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi/Location/ghost', 404, '{}'));
    const service = new RoomUsageService(fhirClient);

    // Act
    const error = await service.usage('ghost', NOW).then(
      () => undefined,
      (caught: unknown) => caught as FhirClientError,
    );

    // Assert
    expect(error?.getStatus()).toBe(404);
    expect(fhirClient.search).not.toHaveBeenCalled();
  });
});
