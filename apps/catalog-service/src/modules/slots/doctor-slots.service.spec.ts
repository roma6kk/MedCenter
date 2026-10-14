import { FhirClientError } from '@medcenter/fhir';

import { InMemoryCacheStore } from '../cache/__tests__/in-memory-cache-store';
import { RedisCacheService } from '../cache/redis-cache.service';
import { DoctorSlotsService } from './doctor-slots.service';
import {
  createFhirClientMock,
  DOCTOR_ID,
  NOW,
  RANGE,
  SCHEDULED,
  searchCallsFor,
} from './__tests__/doctor-slots-fixture';
import { resolveSlotRange } from './slot-range';

describe('DoctorSlotsService', () => {
  const scheduled = SCHEDULED;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return the free slots of the doctor sorted by start when the doctor has a schedule', async () => {
    // Arrange
    const fhirClient = createFhirClientMock(scheduled);
    const service = new DoctorSlotsService(fhirClient, new RedisCacheService());

    // Act
    const response = await service.listFree(DOCTOR_ID, RANGE);

    // Assert
    expect(response).toEqual({
      doctorId: DOCTOR_ID,
      from: RANGE.from,
      to: RANGE.to,
      items: [
        { id: 'slot-a', scheduleId: 'sched-1', start: '2026-11-02T09:00:00.000Z', end: '2026-11-02T09:30:00.000Z', status: 'free' },
        { id: 'slot-b', scheduleId: 'sched-1', start: '2026-11-02T09:30:00.000Z', end: '2026-11-02T10:00:00.000Z', status: 'free' },
      ],
    });
  });

  it('should search free slots of the resolved schedules between explicit clinic-day instants when the range is dates', async () => {
    // Arrange
    const fhirClient = createFhirClientMock({ ...scheduled, schedules: [{ id: 'sched-1' }, { id: 'sched-2' }] });
    const service = new DoctorSlotsService(fhirClient, new RedisCacheService());

    // Act
    await service.listFree(DOCTOR_ID, RANGE);

    // Assert — 2 Nov 00:00 .. 8 Nov 23:59:59.999 in Minsk, never a bare date HAPI would read in its own zone.
    expect(searchCallsFor(fhirClient, 'Slot')[0]).toMatchObject({
      schedule: 'Schedule/sched-1,Schedule/sched-2',
      status: 'free',
      start: ['ge2026-11-01T21:00:00.000Z', 'le2026-11-08T20:59:59.999Z'],
      _sort: 'start,_id',
    });
  });

  it('should look up schedules for the practitioner and each of its active roles', async () => {
    // Arrange
    const fhirClient = createFhirClientMock({ ...scheduled, roles: [{ id: 'role-1' }, { id: 'role-2' }] });
    const service = new DoctorSlotsService(fhirClient, new RedisCacheService());

    // Act
    await service.listFree(DOCTOR_ID, RANGE);

    // Assert
    expect(searchCallsFor(fhirClient, 'PractitionerRole')[0]).toMatchObject({
      practitioner: `Practitioner/${DOCTOR_ID}`,
      'active:not': 'false',
    });
    expect(searchCallsFor(fhirClient, 'Schedule')[0]).toMatchObject({
      actor: `Practitioner/${DOCTOR_ID},PractitionerRole/role-1,PractitionerRole/role-2`,
      'active:not': 'false',
    });
  });

  it('should leave truncated out of the answer when the slot search read every slot', async () => {
    // Arrange
    const service = new DoctorSlotsService(createFhirClientMock(scheduled), new RedisCacheService());

    // Act
    const response = await service.listFree(DOCTOR_ID, RANGE);

    // Assert
    expect(response).not.toHaveProperty('truncated');
  });

  it('should return no slots without a Slot search when the doctor has no schedule', async () => {
    // Arrange
    const fhirClient = createFhirClientMock({ roles: [{ id: 'role-1' }], schedules: [] });
    const service = new DoctorSlotsService(fhirClient, new RedisCacheService());

    // Act
    const response = await service.listFree(DOCTOR_ID, RANGE);

    // Assert
    expect(response.items).toEqual([]);
    expect(searchCallsFor(fhirClient, 'Slot')).toHaveLength(0);
  });

  it('should drop slots that have already started when the response is served', async () => {
    // Arrange
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-02T09:15:00.000Z'));
    const fhirClient = createFhirClientMock(scheduled);
    const service = new DoctorSlotsService(fhirClient, new RedisCacheService());

    // Act
    const response = await service.listFree(DOCTOR_ID, RANGE);

    // Assert
    expect(response.items.map((item) => item.id)).toEqual(['slot-b']);
  });

  it('should apply the exact window in memory when the bounds are date-times inside a day', async () => {
    // Arrange
    const window = resolveSlotRange({ from: '2026-11-02T09:15:00Z', to: '2026-11-02T09:45:00Z' }, NOW);
    const fhirClient = createFhirClientMock(scheduled);
    const service = new DoctorSlotsService(fhirClient, new RedisCacheService());

    // Act
    const response = await service.listFree(DOCTOR_ID, window);

    // Assert
    expect(response.items.map((item) => item.id)).toEqual(['slot-b']);
  });

  it('should answer 404 after a single HAPI call when the practitioner does not exist', async () => {
    // Arrange
    const fhirClient = createFhirClientMock(scheduled);
    fhirClient.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi/Practitioner/x', 404, '{}'));
    const store = new InMemoryCacheStore();
    const service = new DoctorSlotsService(fhirClient, new RedisCacheService(store));

    // Act
    const error = await service.listFree('x', RANGE).then(
      () => undefined,
      (caught: unknown) => caught as FhirClientError,
    );

    // Assert — the public route takes any id: it costs one read, not a read plus a role search,
    // and an unknown id leaves nothing behind in the shared Redis.
    expect(error?.getStatus()).toBe(404);
    expect(fhirClient.read).toHaveBeenCalledTimes(1);
    expect(fhirClient.search).not.toHaveBeenCalled();
    expect(store.entries.size).toBe(0);
  });
});
