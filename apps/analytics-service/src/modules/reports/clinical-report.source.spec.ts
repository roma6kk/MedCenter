import { Logger } from '@nestjs/common';
import type { FhirClient, FhirResource } from '@medcenter/fhir';

import type { DateRange } from '../shared/date-range';
import { FhirClinicalReportSource, NO_SHOW_MAX_PAGES, NO_SHOW_PAGE_SIZE } from './clinical-report.source';

const RANGE: DateRange = {
  from: new Date('2026-10-01T00:00:00.000Z'),
  toExclusive: new Date('2026-11-01T00:00:00.000Z'),
};

function appointments(ids: ReadonlyArray<string>): { entry: Array<{ resource: FhirResource }> } {
  return { entry: ids.map((id) => ({ resource: { resourceType: 'Appointment', id } })) };
}

function idsFrom(start: number, count: number): ReadonlyArray<string> {
  return Array.from({ length: count }, (_, index) => `apt-${start + index}`);
}

describe('FhirClinicalReportSource', () => {
  let fhir: jest.Mocked<Pick<FhirClient, 'search'>>;
  let source: FhirClinicalReportSource;

  beforeEach(() => {
    fhir = { search: jest.fn().mockResolvedValue({ entry: [] }) };
    source = new FhirClinicalReportSource(fhir as unknown as FhirClient);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('noShowAppointmentIds', () => {
    it('should search no-show appointments by start in the half-open period when ids are requested', async () => {
      await source.noShowAppointmentIds(RANGE);

      expect(fhir.search).toHaveBeenCalledWith('Appointment', {
        status: 'noshow',
        date: ['ge2026-10-01T00:00:00.000Z', 'lt2026-11-01T00:00:00.000Z'],
        _elements: 'id',
        _sort: '_lastUpdated',
        _count: NO_SHOW_PAGE_SIZE,
        _offset: 0,
      });
    });

    it('should return the ids of one short page when Bundle.total is reached', async () => {
      fhir.search.mockResolvedValueOnce({ total: 2, ...appointments(['apt-1', 'apt-2']) });

      expect(await source.noShowAppointmentIds(RANGE)).toEqual(['apt-1', 'apt-2']);
      expect(fhir.search).toHaveBeenCalledTimes(1);
    });

    it('should return no ids when HAPI lists no no-show in the period', async () => {
      expect(await source.noShowAppointmentIds(RANGE)).toEqual([]);
    });

    it('should follow the offset by the entries received when HAPI serves fewer than _count', async () => {
      fhir.search
        .mockResolvedValueOnce(appointments(idsFrom(0, 50)))
        .mockResolvedValueOnce(appointments(idsFrom(50, 20)))
        .mockResolvedValueOnce(appointments([]));

      const ids = await source.noShowAppointmentIds(RANGE);

      expect(ids).toHaveLength(70);
      expect(fhir.search).toHaveBeenNthCalledWith(2, 'Appointment', expect.objectContaining({ _offset: 50 }));
      expect(fhir.search).toHaveBeenNthCalledWith(3, 'Appointment', expect.objectContaining({ _offset: 70 }));
    });

    it('should list every id once when a page repeats an entry because HAPI data changed between pages', async () => {
      fhir.search
        .mockResolvedValueOnce(appointments(['apt-1', 'apt-2']))
        .mockResolvedValueOnce(appointments(['apt-2', 'apt-3']))
        .mockResolvedValueOnce(appointments([]));

      expect(await source.noShowAppointmentIds(RANGE)).toEqual(['apt-1', 'apt-2', 'apt-3']);
    });

    it('should stop paging at Bundle.total when HAPI reports it, without asking for an empty page', async () => {
      fhir.search
        .mockResolvedValueOnce({ total: 3, ...appointments(['apt-1', 'apt-2']) })
        .mockResolvedValueOnce({ total: 3, ...appointments(['apt-3']) });

      expect(await source.noShowAppointmentIds(RANGE)).toEqual(['apt-1', 'apt-2', 'apt-3']);
      expect(fhir.search).toHaveBeenCalledTimes(2);
    });

    it('should skip an entry without an id when HAPI returns a partial resource', async () => {
      fhir.search.mockResolvedValueOnce({
        entry: [{ resource: { resourceType: 'Appointment' } }, { resource: { resourceType: 'Appointment', id: 'apt-1' } }],
      });
      fhir.search.mockResolvedValueOnce(appointments([]));

      expect(await source.noShowAppointmentIds(RANGE)).toEqual(['apt-1']);
    });

    it('should fail loudly instead of undercounting when the period holds more no-shows than the safety limit', async () => {
      let next = 0;
      fhir.search.mockImplementation(async () => {
        const page = appointments(idsFrom(next, NO_SHOW_PAGE_SIZE));
        next += NO_SHOW_PAGE_SIZE;
        return page;
      });

      await expect(source.noShowAppointmentIds(RANGE)).rejects.toThrow('no-show appointments');
      expect(fhir.search).toHaveBeenCalledTimes(NO_SHOW_MAX_PAGES);
    });

    it('should propagate a HAPI failure when the search fails, so the report is not built on a guess', async () => {
      fhir.search.mockRejectedValue(new Error('HAPI down'));

      await expect(source.noShowAppointmentIds(RANGE)).rejects.toThrow('HAPI down');
    });
  });

  describe('serviceNames', () => {
    it('should skip the search when no service id is given', async () => {
      expect(await source.serviceNames([])).toEqual(new Map());
      expect(fhir.search).not.toHaveBeenCalled();
    });

    it('should map each id to its name when HAPI returns the HealthcareServices', async () => {
      fhir.search.mockResolvedValueOnce({
        entry: [
          { resource: { resourceType: 'HealthcareService', id: 'svc-1', name: 'УЗИ сердца' } },
          { resource: { resourceType: 'HealthcareService', id: 'svc-2', name: 'Консультация' } },
        ],
      });

      const names = await source.serviceNames(['svc-1', 'svc-2']);

      expect(names).toEqual(new Map([['svc-1', 'УЗИ сердца'], ['svc-2', 'Консультация']]));
      expect(fhir.search).toHaveBeenCalledWith('HealthcareService', { _id: 'svc-1,svc-2', _elements: 'name', _count: 2 });
    });

    it('should leave out a service that has no name when HAPI returns a resource without one', async () => {
      fhir.search.mockResolvedValueOnce({
        entry: [
          { resource: { resourceType: 'HealthcareService', id: 'svc-1' } },
          { resource: { resourceType: 'HealthcareService', id: 'svc-2', name: 'Консультация' } },
        ],
      });

      expect(await source.serviceNames(['svc-1', 'svc-2'])).toEqual(new Map([['svc-2', 'Консультация']]));
    });

    it('should report bare ids and log a warning instead of failing when the name search fails', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      fhir.search.mockRejectedValueOnce(new Error('HAPI down'));

      const names = await source.serviceNames(['svc-1']);

      expect(names).toEqual(new Map());
      expect(warn).toHaveBeenCalledWith(expect.objectContaining({ serviceIds: ['svc-1'] }), expect.stringContaining('names unavailable'));
    });
  });
});
