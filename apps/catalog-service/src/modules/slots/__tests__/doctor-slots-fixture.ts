import type { FhirClient, FhirSearchResult } from '@medcenter/fhir';

import { resolveSlotRange, type SlotRange } from '../slot-range';

export const DOCTOR_ID = 'prac-1';
export const NOW = Date.parse('2026-11-01T00:00:00.000Z');
export const RANGE: SlotRange = resolveSlotRange({ from: '2026-11-02', to: '2026-11-08' }, NOW);

export function bundle(resources: ReadonlyArray<Record<string, unknown>>): FhirSearchResult {
  return { entry: resources.map((resource) => ({ resource: { resourceType: 'Unknown', ...resource } })) };
}

export function slot(id: string, start: string, end: string): Record<string, unknown> {
  return { resourceType: 'Slot', id, start, end, status: 'free', schedule: { reference: 'Schedule/sched-1' } };
}

export interface Fixture {
  readonly roles?: ReadonlyArray<Record<string, unknown>>;
  readonly schedules?: ReadonlyArray<Record<string, unknown>>;
  readonly slots?: ReadonlyArray<Record<string, unknown>>;
}

/** One role, one schedule and two free slots (09:00 and 09:30Z) on 2 Nov. */
export const SCHEDULED: Fixture = {
  roles: [{ id: 'role-1' }],
  schedules: [{ id: 'sched-1' }],
  slots: [
    slot('slot-b', '2026-11-02T09:30:00.000Z', '2026-11-02T10:00:00.000Z'),
    slot('slot-a', '2026-11-02T09:00:00.000Z', '2026-11-02T09:30:00.000Z'),
  ],
};

export function createFhirClientMock(fixture: Fixture): jest.Mocked<FhirClient> {
  const fhirClient = { search: jest.fn(), read: jest.fn() } as unknown as jest.Mocked<FhirClient>;
  fhirClient.read.mockResolvedValue({ resourceType: 'Practitioner', id: DOCTOR_ID });
  fhirClient.search.mockImplementation(async (resourceType) => {
    if (resourceType === 'PractitionerRole') return bundle(fixture.roles ?? []);
    if (resourceType === 'Schedule') return bundle(fixture.schedules ?? []);
    return bundle(fixture.slots ?? []);
  });
  return fhirClient;
}

export function searchCallsFor(
  fhirClient: jest.Mocked<FhirClient>,
  resourceType: string,
): ReadonlyArray<Record<string, unknown>> {
  return fhirClient.search.mock.calls
    .filter(([type]) => type === resourceType)
    .map(([, params]) => params ?? {});
}
