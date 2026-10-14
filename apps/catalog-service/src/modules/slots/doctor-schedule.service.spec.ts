import { Logger } from '@nestjs/common';
import type { FhirClient, FhirSearchResult } from '@medcenter/fhir';

import { FHIR_PAGE_SIZE } from '../../common/fhir-search';
import { DoctorScheduleService } from './doctor-schedule.service';
import { resolveSlotRange } from './slot-range';
import { SLOT_SEARCH_MAX_PAGES } from './slot-search';

const ROLE_ID = 'role-7';
const RANGE = resolveSlotRange({ from: '2026-11-02', to: '2026-11-08' }, Date.parse('2026-11-01T00:00:00.000Z'));

function bundle(resources: ReadonlyArray<Record<string, unknown>>): FhirSearchResult {
  return { entry: resources.map((resource) => ({ resource: { resourceType: 'Unknown', ...resource } })) };
}

function createFhirClientMock(
  schedules: ReadonlyArray<Record<string, unknown>>,
  slots: ReadonlyArray<Record<string, unknown>>,
): jest.Mocked<FhirClient> {
  const fhirClient = { search: jest.fn() } as unknown as jest.Mocked<FhirClient>;
  fhirClient.search.mockImplementation(async (resourceType) =>
    resourceType === 'Schedule' ? bundle(schedules) : bundle(slots),
  );
  return fhirClient;
}

describe('DoctorScheduleService', () => {
  const schedule = {
    resourceType: 'Schedule',
    id: 'sched-1',
    active: true,
    actor: [{ reference: `PractitionerRole/${ROLE_ID}` }, { reference: 'Location/room-1' }],
  };
  const slots = [
    { resourceType: 'Slot', id: 'slot-2', status: 'busy', start: '2026-11-02T09:30:00.000Z', end: '2026-11-02T10:00:00.000Z', schedule: { reference: 'Schedule/sched-1' } },
    { resourceType: 'Slot', id: 'slot-1', status: 'free', start: '2026-11-02T09:00:00.000Z', end: '2026-11-02T09:30:00.000Z', schedule: { reference: 'Schedule/sched-1' } },
  ];

  it('should return the schedules and the free and busy slots of the role when it has a schedule', async () => {
    // Arrange
    const service = new DoctorScheduleService(createFhirClientMock([schedule], slots));

    // Act
    const response = await service.forRole(ROLE_ID, RANGE);

    // Assert
    expect(response.practitionerRoleId).toBe(ROLE_ID);
    expect(response.from).toBe(RANGE.from);
    expect(response.to).toBe(RANGE.to);
    expect(response.schedules.map((item) => item.id)).toEqual(['sched-1']);
    expect(response.items.map((item) => [item.id, item.status])).toEqual([
      ['slot-1', 'free'],
      ['slot-2', 'busy'],
    ]);
    expect(response).not.toHaveProperty('truncated');
  });

  it('should flag the answer as truncated when the slot search hits the page cap', async () => {
    // Arrange — every Slot page is full, so the cap (not the data) ends the search.
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const fhirClient = { search: jest.fn() } as unknown as jest.Mocked<FhirClient>;
    fhirClient.search.mockImplementation(async (resourceType, params) => {
      if (resourceType === 'Schedule') return bundle([schedule]);
      const offset = Number((params ?? {})['_offset']);
      return bundle(
        Array.from({ length: FHIR_PAGE_SIZE }, (_, index) => ({
          resourceType: 'Slot',
          id: `slot-${offset + index}`,
          status: 'free',
          start: new Date(Date.parse('2026-11-01T21:00:00.000Z') + (offset + index) * 20_000).toISOString(),
          end: '2026-11-02T00:00:00.000Z',
          schedule: { reference: 'Schedule/sched-1' },
        })),
      );
    });
    const service = new DoctorScheduleService(fhirClient);

    // Act
    const response = await service.forRole(ROLE_ID, RANGE);

    // Assert — the doctor sees the slots that were read and is told the list may go on.
    expect(response.truncated).toBe(true);
    expect(response.items).toHaveLength(SLOT_SEARCH_MAX_PAGES * FHIR_PAGE_SIZE);
    warn.mockRestore();
  });

  it('should scope the search to the token PractitionerRole and to free or busy slots', async () => {
    // Arrange
    const fhirClient = createFhirClientMock([schedule], slots);
    const service = new DoctorScheduleService(fhirClient);

    // Act
    await service.forRole(ROLE_ID, RANGE);

    // Assert
    expect(fhirClient.search).toHaveBeenCalledWith(
      'Schedule',
      expect.objectContaining({ actor: `PractitionerRole/${ROLE_ID}`, 'active:not': 'false' }),
    );
    expect(fhirClient.search).toHaveBeenCalledWith(
      'Slot',
      expect.objectContaining({
        schedule: 'Schedule/sched-1',
        status: 'free,busy',
        // Whole clinic days (Minsk, UTC+3) as explicit instants, not bare dates read in the HAPI zone.
        start: ['ge2026-11-01T21:00:00.000Z', 'le2026-11-08T20:59:59.999Z'],
        _sort: 'start,_id',
      }),
    );
  });

  it('should give every slot a clinic-time label when the doctor view renders the list', async () => {
    // Arrange
    const service = new DoctorScheduleService(createFhirClientMock([schedule], slots));

    // Act
    const response = await service.forRole(ROLE_ID, RANGE);

    // Assert — the frontend `DoctorScheduleView` renders `items[].label` verbatim.
    expect(response.items.map((item) => item.label)).toEqual([
      '02.11.2026 12:00–12:30 · свободен',
      '02.11.2026 12:30–13:00 · занят',
    ]);
  });

  it('should return an empty schedule without a Slot search when the role has no schedule', async () => {
    // Arrange
    const fhirClient = createFhirClientMock([], slots);
    const service = new DoctorScheduleService(fhirClient);

    // Act
    const response = await service.forRole(ROLE_ID, RANGE);

    // Assert
    expect(response.schedules).toEqual([]);
    expect(response.items).toEqual([]);
    expect(fhirClient.search).toHaveBeenCalledTimes(1);
  });
});
