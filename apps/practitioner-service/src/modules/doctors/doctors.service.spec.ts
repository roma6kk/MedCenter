import type { FhirClient, FhirResource } from '@medcenter/fhir';

import { DoctorsService } from './doctors.service';

function practitioner(id: string, lastName: string): FhirResource {
  return {
    resourceType: 'Practitioner',
    id,
    name: [{ family: lastName, given: ['Ivan'] }],
  };
}

describe('DoctorsService', () => {
  let doctorsService: DoctorsService;
  let fhirClient: jest.Mocked<FhirClient>;

  beforeEach(() => {
    fhirClient = {
      search: jest.fn(),
      read: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      batch: jest.fn(),
    } as unknown as jest.Mocked<FhirClient>;
    doctorsService = new DoctorsService(fhirClient);
  });

  describe('serviceId filter', () => {
    it('resolves practitioners through the PractitionerRole service reference', async () => {
      fhirClient.search
        .mockResolvedValueOnce({
          entry: [
            { resource: { resourceType: 'PractitionerRole', practitioner: { reference: 'Practitioner/101' } } },
            { resource: { resourceType: 'PractitionerRole', practitioner: { reference: 'Practitioner/102' } } },
          ],
        })
        .mockResolvedValueOnce({
          entry: [
            { resource: practitioner('101', 'Ivanov') },
            { resource: practitioner('102', 'Petrov') },
          ],
        });

      const result = await doctorsService.list({ serviceId: 'svc-1' });

      expect(result.map((doc) => doc.id)).toEqual(['101', '102']);
      // Search 1: PractitionerRole restricted to the HealthcareService...
      expect(fhirClient.search.mock.calls[0]).toEqual([
        'PractitionerRole',
        { service: 'HealthcareService/svc-1', _count: 500 },
      ]);
      // Search 2: Practitioner restricted to the collected ids.
      expect(fhirClient.search.mock.calls[1]).toEqual([
        'Practitioner',
        { _id: '101,102', _count: 20, _offset: 0 },
      ]);
    });

    it('propagates specialty and name filters into the Practitioner search', async () => {
      fhirClient.search
        .mockResolvedValueOnce({
          entry: [{ resource: { resourceType: 'PractitionerRole', practitioner: { reference: 'Practitioner/101' } } }],
        })
        .mockResolvedValueOnce({ entry: [{ resource: practitioner('101', 'Ivanov') }] });

      await doctorsService.list({ serviceId: 'svc-1', specialty: 'therapist', search: 'Va' });

      expect(fhirClient.search.mock.calls[1]).toEqual([
        'Practitioner',
        {
          _id: '101',
          'qualification-code': 'therapist',
          name: 'Va',
          _count: 20,
          _offset: 0,
        },
      ]);
    });

    it('returns an empty list without a Practitioner search when the service has no roles', async () => {
      fhirClient.search.mockResolvedValueOnce({ entry: [] });

      const result = await doctorsService.list({ serviceId: 'svc-empty' });

      expect(result).toEqual([]);
      expect(fhirClient.search).toHaveBeenCalledTimes(1);
    });

    it('ignores roles without a practitioner reference', async () => {
      fhirClient.search
        .mockResolvedValueOnce({
          entry: [
            { resource: { resourceType: 'PractitionerRole' } },
            { resource: { resourceType: 'PractitionerRole', practitioner: { reference: 'Practitioner/103' } } },
          ],
        })
        .mockResolvedValueOnce({
          entry: [{ resource: practitioner('103', 'Sidorov') }],
        });

      const result = await doctorsService.list({ serviceId: 'svc-1' });

      expect(result.map((doc) => doc.id)).toEqual(['103']);
      expect(fhirClient.search.mock.calls[1]).toEqual([
        'Practitioner',
        { _id: '103', _count: 20, _offset: 0 },
      ]);
    });

    it('returns the plain list when no serviceId is supplied', async () => {
      fhirClient.search.mockResolvedValue({
        entry: [{ resource: practitioner('201', 'Sidorov') }],
      });

      const result = await doctorsService.list({ specialty: 'therapist' });

      expect(result.map((doc) => doc.id)).toEqual(['201']);
      // Unfiltered path searches Practitioner directly — no PractitionerRole hop.
      expect(fhirClient.search).toHaveBeenCalledTimes(1);
      expect(fhirClient.search.mock.calls[0][0]).toBe('Practitioner');
    });
  });
});
