import { Logger } from '@nestjs/common';
import type { FhirBundleEntry, FhirClient, FhirSearchResult } from '@medcenter/fhir';

import { FHIR_PAGE_SIZE } from '../../common/fhir-search';
import { idsOf, searchActiveSchedules, searchScheduleSlots, SLOT_SEARCH_MAX_PAGES } from './slot-search';

function schedulesPage(count: number, offset: number): FhirSearchResult {
  return {
    entry: Array.from({ length: count }, (_, i) => ({
      resource: { resourceType: 'Schedule', id: `sched-${offset + i}` },
    })),
  };
}

function createFhirClientMock(): jest.Mocked<FhirClient> {
  return { search: jest.fn() } as unknown as jest.Mocked<FhirClient>;
}

describe('searchActiveSchedules', () => {
  it('should read the next page when the first one is full', async () => {
    // Arrange
    const fhirClient = createFhirClientMock();
    fhirClient.search
      .mockResolvedValueOnce(schedulesPage(FHIR_PAGE_SIZE, 0))
      .mockResolvedValueOnce(schedulesPage(3, FHIR_PAGE_SIZE));

    // Act
    const schedules = await searchActiveSchedules(fhirClient, 'PractitionerRole/role-1');

    // Assert — a single search would hand back 200 schedules as if they were all.
    expect(schedules).toHaveLength(FHIR_PAGE_SIZE + 3);
    expect(fhirClient.search).toHaveBeenCalledTimes(2);
  });

  it('should order by id and keep schedules that never set active when the search is built', async () => {
    // Arrange
    const fhirClient = createFhirClientMock();
    fhirClient.search.mockResolvedValue(schedulesPage(1, 0));

    // Act
    await searchActiveSchedules(fhirClient, 'Practitioner/p-1,PractitionerRole/role-1');

    // Assert
    expect(fhirClient.search).toHaveBeenCalledWith('Schedule', {
      actor: 'Practitioner/p-1,PractitionerRole/role-1',
      'active:not': 'false',
      _sort: '_id',
      _count: FHIR_PAGE_SIZE,
      _offset: 0,
    });
  });
});

describe('searchScheduleSlots', () => {
  const range = { fromMs: Date.parse('2026-11-01T21:00:00.000Z'), toMs: Date.parse('2026-11-02T20:59:59.999Z') };

  it('should page with a total sort order when slots of different schedules share a start', async () => {
    // Arrange
    const fhirClient = createFhirClientMock();
    fhirClient.search.mockResolvedValue({ entry: [] });

    // Act
    await searchScheduleSlots(fhirClient, ['s1', 's2'], range, 'free');

    // Assert — `_sort=start` alone would repeat or lose a tie on a page boundary.
    expect(fhirClient.search).toHaveBeenCalledWith(
      'Slot',
      expect.objectContaining({
        schedule: 'Schedule/s1,Schedule/s2',
        status: 'free',
        start: ['ge2026-11-01T21:00:00.000Z', 'le2026-11-02T20:59:59.999Z'],
        _sort: 'start,_id',
      }),
    );
  });

  it('should order by instant and drop a repeated id when offsets differ and a row appears on two pages', async () => {
    // Arrange
    const fhirClient = createFhirClientMock();
    const slot = (id: string, start: string): FhirBundleEntry => ({
      resource: { resourceType: 'Slot', id, status: 'free', start, end: start, schedule: { reference: 'Schedule/s1' } },
    });
    fhirClient.search.mockResolvedValue({
      entry: [slot('late', '2026-11-02T10:00:00+03:00'), slot('early', '2026-11-02T06:30:00Z'), slot('early', '2026-11-02T06:30:00Z')],
    });

    // Act
    const { slots } = await searchScheduleSlots(fhirClient, ['s1'], range, 'free');

    // Assert — 06:30Z comes before 10:00+03:00 (07:00Z), which a string sort would invert.
    expect(slots.map((item) => item.id)).toEqual(['early', 'late']);
  });

  it('should read up to the slot page cap when every page is full', async () => {
    // Arrange — a 31-day range of 5-minute slots needs 47 pages, more than the default 10.
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const fhirClient = createFhirClientMock();
    fhirClient.search.mockImplementation(async (_type, params) => {
      const offset = Number((params ?? {})['_offset']);
      return {
        entry: Array.from({ length: FHIR_PAGE_SIZE }, (_, i) => ({
          resource: {
            resourceType: 'Slot',
            id: `slot-${offset + i}`,
            status: 'free',
            start: new Date(Date.parse('2026-11-01T21:00:00.000Z') + (offset + i) * 300_000).toISOString(),
            end: '2026-11-02T00:00:00.000Z',
            schedule: { reference: 'Schedule/s1' },
          },
        })),
      };
    });

    // Act
    const result = await searchScheduleSlots(fhirClient, ['s1'], range, 'free');

    // Assert
    expect(fhirClient.search).toHaveBeenCalledTimes(SLOT_SEARCH_MAX_PAGES);
    expect(result.slots).toHaveLength(SLOT_SEARCH_MAX_PAGES * FHIR_PAGE_SIZE);
    expect(result.truncated).toBe(true);
    warn.mockRestore();
  });

  it('should report the list as complete when the last page is short', async () => {
    // Arrange
    const fhirClient = createFhirClientMock();
    fhirClient.search.mockResolvedValue({ entry: [] });

    // Act
    const result = await searchScheduleSlots(fhirClient, ['s1'], range, 'free');

    // Assert
    expect(result).toEqual({ slots: [], truncated: false });
  });

  it('should skip the Slot search when there are no schedules', async () => {
    // Arrange
    const fhirClient = createFhirClientMock();

    // Act
    const result = await searchScheduleSlots(fhirClient, [], range, 'free');

    // Assert
    expect(result).toEqual({ slots: [], truncated: false });
    expect(fhirClient.search).not.toHaveBeenCalled();
  });
});

describe('idsOf', () => {
  it('should drop resources without an id when ids are collected', () => {
    expect(idsOf([{ resourceType: 'Schedule', id: 'a' }, { resourceType: 'Schedule' }, { resourceType: 'Schedule', id: '' }])).toEqual(['a']);
  });
});
