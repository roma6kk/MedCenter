import type { FhirClient, FhirResource } from '@medcenter/fhir';

import { PLANNING_HORIZON_EXT, SLOT_DURATION_EXT, WEEKLY_WINDOWS_EXT } from '../schedule.constants';
import { batchResponseFor } from './batch-echo';

export const ACTOR = { sub: 'admin-1', requestId: 'req-1' };
export const SCHEDULE_ID = 'sched-9';
export const ONE_DAY = { from: '2026-11-02', to: '2026-11-02' };

export interface Window {
  readonly dayOfWeek: string;
  readonly startTime: string;
  readonly endTime: string;
}

export const MONDAY_09_10: readonly Window[] = [{ dayOfWeek: 'MO', startTime: '09:00', endTime: '10:00' }];
export const MONDAY_09_12: readonly Window[] = [{ dayOfWeek: 'MO', startTime: '09:00', endTime: '12:00' }];

export function scheduleOf(windows: readonly Window[] = MONDAY_09_12, durationMin = 30, horizon?: { start?: string; end?: string }): FhirResource {
  return {
    resourceType: 'Schedule',
    id: SCHEDULE_ID,
    extension: [
      { url: SLOT_DURATION_EXT, valueInteger: durationMin },
      { url: WEEKLY_WINDOWS_EXT, valueString: JSON.stringify(windows) },
      ...(horizon === undefined ? [] : [{ url: PLANNING_HORIZON_EXT, valuePeriod: horizon }]),
    ],
  };
}

export function generatorFhirMock(schedule: FhirResource = scheduleOf()): jest.Mocked<FhirClient> {
  return {
    read: jest.fn().mockResolvedValue(schedule),
    search: jest.fn().mockResolvedValue({ entry: [] }),
    batch: jest.fn().mockImplementation(async (bundle: FhirResource) => batchResponseFor(bundle)),
  } as unknown as jest.Mocked<FhirClient>;
}

/** The existing slots of the schedule; a search that asks for a status gets only the slots of that status. */
export function searchesFor(fhirClient: jest.Mocked<FhirClient>, result: { entry?: Array<{ resource: FhirResource }> }): void {
  fhirClient.search.mockImplementation(async (_type, params) => {
    const status = (params as { status?: string } | undefined)?.status;
    return { entry: (result.entry ?? []).filter((entry) => status === undefined || entry.resource['status'] === status) };
  });
}
