import { FhirClientError, type FhirClient, type FhirSearchResult } from '@medcenter/fhir';
import { translationExtension } from '@medcenter/fhir-mappers';
import { MEDCENTER_EXT } from '@medcenter/terminology';

import { MAX_ROOM_SCHEDULES, MAX_USAGE_SLOTS, RoomUsageService } from './room-usage.service';

const IS_ROOM = { physicalType: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/location-physical-type', code: 'ro' }] } };

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

const ROLE: Json = { resourceType: 'PractitionerRole', id: 'role-7', practitioner: { reference: 'Practitioner/prac-1' } };
const PRACTITIONER: Json = { resourceType: 'Practitioner', id: 'prac-1', name: [{ family: 'Иванов', given: ['Иван'] }] };
const SERVICE: Json = { resourceType: 'HealthcareService', id: 'svc-1', name: 'Консультация терапевта' };

const INCLUDED: readonly Json[] = [ROLE, PRACTITIONER, SERVICE, { resourceType: 'Location', ...IS_ROOM, id: ROOM_ID, name: 'Кабинет 204' }];

function inEnglish(content: string): Json {
  return { extension: [translationExtension('en', content)] };
}

const PRACTITIONER_EN: Json = {
  ...PRACTITIONER,
  name: [{ family: 'Иванов', _family: inEnglish('Ivanov'), given: ['Иван'], _given: [inEnglish('Ivan')] }],
};
const SERVICE_EN: Json = { ...SERVICE, _name: inEnglish('Therapist consultation') };

interface Referrers {
  readonly schedules?: readonly Json[];
  readonly roles?: readonly Json[];
  readonly services?: readonly Json[];
  readonly slots?: readonly Json[];
}

function createFhirClientMock({ schedules = [], roles = [], services = [], slots = [] }: Referrers): jest.Mocked<FhirClient> {
  const fhirClient = { read: jest.fn(), search: jest.fn() } as unknown as jest.Mocked<FhirClient>;
  fhirClient.read.mockResolvedValue({ resourceType: 'Location', ...IS_ROOM, id: ROOM_ID });
  fhirClient.search.mockImplementation(async (resourceType) => {
    switch (resourceType) {
      case 'Schedule':
        return bundle(schedules);
      case 'PractitionerRole':
        return bundle(roles);
      case 'HealthcareService':
        return bundle(services);
      default:
        return bundle(slots);
    }
  });
  return fhirClient;
}

function searchOf(fhirClient: jest.Mocked<FhirClient>, resourceType: string): Json | undefined {
  return fhirClient.search.mock.calls.find(([type]) => type === resourceType)?.[1];
}

describe('RoomUsageService', () => {
  const slots = [bookedSlot('slot-1', '2026-11-02T09:00:00.000Z', '2026-11-02T09:30:00.000Z')];

  it('should list the referencing schedule and its upcoming booked slots when the room is in use', async () => {
    const service = new RoomUsageService(createFhirClientMock({ schedules: [SCHEDULE, ...INCLUDED], slots }));

    const usage = await service.usage(ROOM_ID, 'ru', NOW);

    expect(usage).toEqual({
      roomId: ROOM_ID,
      inUse: true,
      truncated: false,
      items: [
        {
          resourceType: 'Schedule',
          id: 'sched-1',
          isActive: true,
          display: 'Иванов Иван · Консультация терапевта · 01.11.2026–30.11.2026',
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
    const fhirClient = createFhirClientMock({ schedules: [SCHEDULE], slots });
    const service = new RoomUsageService(fhirClient);

    await service.usage(ROOM_ID, 'ru', NOW);

    expect(searchOf(fhirClient, 'Schedule')).toMatchObject({
      actor: `Location/${ROOM_ID}`,
      _include: 'Schedule:actor',
      '_include:iterate': 'PractitionerRole:practitioner',
    });
    expect(searchOf(fhirClient, 'Schedule')).not.toHaveProperty('location');
  });

  it('should find doctor roles and services through `location`, the search parameter both have, without an active filter', async () => {
    const fhirClient = createFhirClientMock({});

    await new RoomUsageService(fhirClient).usage(ROOM_ID, 'ru', NOW);

    expect(searchOf(fhirClient, 'PractitionerRole')).toEqual({
      location: `Location/${ROOM_ID}`,
      _include: 'PractitionerRole:practitioner',
      _count: MAX_ROOM_SCHEDULES,
    });
    expect(searchOf(fhirClient, 'HealthcareService')).toEqual({ location: `Location/${ROOM_ID}`, _count: MAX_ROOM_SCHEDULES });
  });

  it('should search only booked slots of those schedules that start from now on when it looks for bookings', async () => {
    const fhirClient = createFhirClientMock({ schedules: [SCHEDULE, { ...SCHEDULE, id: 'sched-2', active: false }], slots });
    const service = new RoomUsageService(fhirClient);

    await service.usage(ROOM_ID, 'ru', NOW);

    expect(searchOf(fhirClient, 'Slot')).toEqual({
      schedule: 'Schedule/sched-1,Schedule/sched-2',
      status: 'busy',
      start: 'ge2026-11-01T06:00:00.000Z',
      _sort: 'start',
      _count: MAX_USAGE_SLOTS + 1,
    });
  });

  it('should keep an inactive schedule in the list, flagged and worded once, when it still references the room', async () => {
    const inactive = { ...SCHEDULE, active: false, extension: [] };
    const service = new RoomUsageService(createFhirClientMock({ schedules: [inactive] }));

    const usage = await service.usage(ROOM_ID, 'ru', NOW);

    expect(usage.inUse).toBe(true);
    expect(usage.items).toEqual([{ resourceType: 'Schedule', id: 'sched-1', isActive: false, display: 'PractitionerRole/role-7' }]);
  });

  it('should name the schedule by its reference when nothing else describes it', async () => {
    const bare = { resourceType: 'Schedule', id: 'sched-9', actor: [{ reference: `Location/${ROOM_ID}` }] };
    const service = new RoomUsageService(createFhirClientMock({ schedules: [bare] }));

    const usage = await service.usage(ROOM_ID, 'ru', NOW);

    expect(usage.items).toEqual([{ resourceType: 'Schedule', id: 'sched-9', isActive: true, display: 'Schedule/sched-9' }]);
  });

  it('should report a free room without a Slot search when no schedule, role or service references it', async () => {
    const fhirClient = createFhirClientMock({ slots });
    const service = new RoomUsageService(fhirClient);

    const usage = await service.usage(ROOM_ID, 'ru', NOW);

    expect(usage).toEqual({ roomId: ROOM_ID, inUse: false, truncated: false, items: [] });
    expect(searchOf(fhirClient, 'Slot')).toBeUndefined();
  });

  describe('a doctor role or a service that lists the room', () => {
    it('should report the room in use, with a line for each, when no schedule references it', async () => {
      const fhirClient = createFhirClientMock({ roles: [ROLE, PRACTITIONER], services: [SERVICE], slots });

      const usage = await new RoomUsageService(fhirClient).usage(ROOM_ID, 'ru', NOW);

      expect(usage).toEqual({
        roomId: ROOM_ID,
        inUse: true,
        truncated: false,
        items: [
          { resourceType: 'PractitionerRole', id: 'role-7', isActive: true, display: 'Иванов Иван' },
          { resourceType: 'HealthcareService', id: 'svc-1', isActive: true, display: 'Консультация терапевта' },
        ],
      });
      expect(searchOf(fhirClient, 'Slot')).toBeUndefined();
    });

    it('should list schedules, then roles, then services, then the booked slots', async () => {
      const fhirClient = createFhirClientMock({ schedules: [SCHEDULE, ...INCLUDED], roles: [ROLE, PRACTITIONER], services: [SERVICE], slots });

      const usage = await new RoomUsageService(fhirClient).usage(ROOM_ID, 'ru', NOW);

      expect(usage.items.map((item) => item.resourceType)).toEqual(['Schedule', 'PractitionerRole', 'HealthcareService', 'Slot']);
    });

    it('should flag a deactivated role and a deactivated service, which still pin the room', async () => {
      const fhirClient = createFhirClientMock({
        roles: [{ ...ROLE, active: false }, PRACTITIONER],
        services: [{ ...SERVICE, active: false }],
      });

      const usage = await new RoomUsageService(fhirClient).usage(ROOM_ID, 'ru', NOW);

      expect(usage.inUse).toBe(true);
      expect(usage.items.map((item) => item.isActive)).toEqual([false, false]);
    });

    it('should name a role by its reference when its practitioner was not returned, and a nameless service by its reference', async () => {
      const fhirClient = createFhirClientMock({ roles: [ROLE], services: [{ resourceType: 'HealthcareService', id: 'svc-2' }] });

      const usage = await new RoomUsageService(fhirClient).usage(ROOM_ID, 'ru', NOW);

      expect(usage.items.map((item) => item.display)).toEqual(['PractitionerRole/role-7', 'HealthcareService/svc-2']);
    });
  });

  describe('in English', () => {
    it('should word the schedule, the role, the service and the booking in English when the client asks for en', async () => {
      const fhirClient = createFhirClientMock({
        schedules: [SCHEDULE, ROLE, PRACTITIONER_EN, SERVICE_EN],
        roles: [ROLE, PRACTITIONER_EN],
        services: [SERVICE_EN],
        slots,
      });

      const usage = await new RoomUsageService(fhirClient).usage(ROOM_ID, 'en', NOW);

      expect(usage.items.map((item) => item.display)).toEqual([
        'Ivanov Ivan · Therapist consultation · 01.11.2026–30.11.2026',
        'Ivanov Ivan',
        'Therapist consultation',
        '02.11.2026 12:00–12:30 · booking · Ivanov Ivan',
      ]);
    });

    it('should keep the stored Russian text of a name that has no English translation', async () => {
      const fhirClient = createFhirClientMock({ schedules: [SCHEDULE, ROLE, PRACTITIONER, SERVICE] });

      const usage = await new RoomUsageService(fhirClient).usage(ROOM_ID, 'en', NOW);

      expect(usage.items.map((item) => item.display)).toEqual(['Иванов Иван · Консультация терапевта · 01.11.2026–30.11.2026']);
    });

    it('should word a line in Russian when the language is not given', async () => {
      const fhirClient = createFhirClientMock({ schedules: [SCHEDULE, ROLE, PRACTITIONER_EN, SERVICE_EN] });

      const usage = await new RoomUsageService(fhirClient).usage(ROOM_ID);

      expect(usage.items.map((item) => item.display)).toEqual(['Иванов Иван · Консультация терапевта · 01.11.2026–30.11.2026']);
    });
  });

  it('should cap the booked slots and flag truncation when more bookings exist than the cap', async () => {
    const many = Array.from({ length: MAX_USAGE_SLOTS + 1 }, (_, index) =>
      bookedSlot(`slot-${index}`, '2026-11-02T09:00:00.000Z', '2026-11-02T09:30:00.000Z'),
    );
    const service = new RoomUsageService(createFhirClientMock({ schedules: [SCHEDULE], slots: many }));

    const usage = await service.usage(ROOM_ID, 'ru', NOW);

    expect(usage.truncated).toBe(true);
    expect(usage.items.filter((item) => item.resourceType === 'Slot')).toHaveLength(MAX_USAGE_SLOTS);
  });

  it('should answer 404 without searching when the room does not exist', async () => {
    const fhirClient = createFhirClientMock({ schedules: [SCHEDULE], slots });
    fhirClient.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi/Location/ghost', 404, '{}'));
    const service = new RoomUsageService(fhirClient);

    const error = await service.usage('ghost', 'ru', NOW).then(
      () => undefined,
      (caught: unknown) => caught as FhirClientError,
    );

    expect(error?.getStatus()).toBe(404);
    expect(fhirClient.search).not.toHaveBeenCalled();
  });

  it('should answer 404 and search nothing when the Location is not a room', async () => {
    const fhirClient = createFhirClientMock({});
    fhirClient.read.mockResolvedValue({ resourceType: 'Location', id: 'building-1', physicalType: { coding: [{ code: 'bu' }] } });

    const error = await new RoomUsageService(fhirClient).usage('building-1').then(
      () => undefined,
      (caught: unknown) => caught as FhirClientError,
    );

    expect(error).toBeInstanceOf(FhirClientError);
    expect(error?.getStatus()).toBe(404);
    expect(fhirClient.search).not.toHaveBeenCalled();
  });
});
