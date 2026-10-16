import type { FhirClient, FhirResource } from '@medcenter/fhir';

import { PLANNING_HORIZON_EXT, WEEKLY_WINDOWS_EXT } from './schedule.constants';
import { assertNoScheduleOverlap, horizonsIntersect, type OverlapCandidate } from './schedule-overlap';

type Window = { dayOfWeek: string; startTime: string; endTime: string };
const MONDAY_MORNING: Window = { dayOfWeek: 'MO', startTime: '09:00', endTime: '12:00' };

function schedule(id: string, windows: Window[], start: string, end: string): FhirResource {
  return {
    resourceType: 'Schedule',
    id,
    active: true,
    extension: [
      { url: WEEKLY_WINDOWS_EXT, valueString: JSON.stringify(windows) },
      { url: PLANNING_HORIZON_EXT, valuePeriod: { start, end } },
    ],
  };
}

function fhirWith(...existing: FhirResource[]): jest.Mocked<FhirClient> {
  return { search: jest.fn().mockResolvedValue({ entry: existing.map((resource) => ({ resource })) }) } as unknown as jest.Mocked<FhirClient>;
}

function candidate(overrides: Partial<OverlapCandidate> = {}): OverlapCandidate {
  return {
    practitionerRoleId: 'role-1',
    windows: [MONDAY_MORNING],
    horizon: { start: '2026-12-01', end: '2026-12-31' },
    ...overrides,
  } as OverlapCandidate;
}

describe('horizonsIntersect', () => {
  it.each([
    ['share a day', { start: '2026-12-01', end: '2026-12-10' }, { start: '2026-12-10', end: '2026-12-20' }, true],
    ['are nested', { start: '2026-12-01', end: '2026-12-31' }, { start: '2026-12-05', end: '2026-12-06' }, true],
    ['are disjoint', { start: '2026-12-01', end: '2026-12-10' }, { start: '2026-12-11', end: '2026-12-20' }, false],
    ['have no bounds', {}, { start: '2026-12-11', end: '2026-12-20' }, true],
  ])('should report %s as %s', (_label, a, b, expected) => {
    expect(horizonsIntersect(a, b)).toBe(expected);
  });
});

describe('assertNoScheduleOverlap', () => {
  it('should refuse the same weekday window in an overlapping horizon with SCHEDULE_OVERLAP', async () => {
    const fhir = fhirWith(schedule('s-1', [MONDAY_MORNING], '2026-12-15', '2027-01-15'));

    await expect(assertNoScheduleOverlap(fhir, candidate())).rejects.toThrow('SCHEDULE_OVERLAP');
  });

  it('should accept the same weekday window in a later, disjoint horizon', async () => {
    const fhir = fhirWith(schedule('s-1', [MONDAY_MORNING], '2027-01-01', '2027-02-01'));

    await expect(assertNoScheduleOverlap(fhir, candidate())).resolves.toBeUndefined();
  });

  it('should accept different hours of the same weekday in the same horizon', async () => {
    const afternoon = { dayOfWeek: 'MO', startTime: '14:00', endTime: '17:00' };
    const fhir = fhirWith(schedule('s-1', [afternoon], '2026-12-01', '2026-12-31'));

    await expect(assertNoScheduleOverlap(fhir, candidate())).resolves.toBeUndefined();
  });

  it('should not conflict with the schedule that is being edited', async () => {
    const fhir = fhirWith(schedule('s-1', [MONDAY_MORNING], '2026-12-01', '2026-12-31'));

    await expect(assertNoScheduleOverlap(fhir, candidate({ excludeScheduleId: 's-1' }))).resolves.toBeUndefined();
  });

  it('should refuse windows of the candidate that intersect each other without asking HAPI', async () => {
    const fhir = fhirWith();
    const clash = [MONDAY_MORNING, { dayOfWeek: 'MO', startTime: '11:00', endTime: '13:00' }];

    await expect(assertNoScheduleOverlap(fhir, candidate({ windows: clash } as Partial<OverlapCandidate>))).rejects.toThrow('weekly windows intersect');
    expect(fhir.search).not.toHaveBeenCalled();
  });

  it('should look only at the active schedules of the practitioner role', async () => {
    const fhir = fhirWith();

    await assertNoScheduleOverlap(fhir, candidate());

    expect(fhir.search).toHaveBeenCalledWith('Schedule', expect.objectContaining({ actor: 'PractitionerRole/role-1', active: 'true' }));
  });
});
