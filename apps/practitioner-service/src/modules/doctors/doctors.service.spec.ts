import type { FhirClient, FhirResource } from '@medcenter/fhir';

import { DoctorsService } from './doctors.service';

function practitioner(id: string, lastName: string): FhirResource {
  return {
    resourceType: 'Practitioner',
    id,
    name: [{ family: lastName, given: ['Ivan'] }],
  };
}

function role(id: string, practitionerRef?: string): FhirResource {
  return {
    resourceType: 'PractitionerRole',
    id,
    ...(practitionerRef === undefined ? {} : { practitioner: { reference: practitionerRef } }),
  };
}

/** A `PractitionerRole` search Bundle with `_include=PractitionerRole:practitioner`: matches first, then the includes. */
function roleBundle(roles: readonly FhirResource[], practitioners: readonly FhirResource[]): { entry: { resource: FhirResource }[] } {
  return { entry: [...roles, ...practitioners].map((resource) => ({ resource })) };
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

  describe('list without a role filter', () => {
    it('should search Practitioner with the page window when no filter is supplied', async () => {
      // Arrange
      fhirClient.search.mockResolvedValue({ entry: [{ resource: practitioner('201', 'Sidorov') }] });

      // Act
      const result = await doctorsService.list({});

      // Assert
      expect(result.items.map((doc) => doc.id)).toEqual(['201']);
      expect(fhirClient.search).toHaveBeenCalledTimes(1);
      expect(fhirClient.search).toHaveBeenCalledWith('Practitioner', { _count: 20, _offset: 0, _total: 'accurate' });
    });

    it('should search Practitioner by name and page when only a search term is supplied', async () => {
      // Arrange
      fhirClient.search.mockResolvedValue({ entry: [] });

      // Act
      await doctorsService.list({ search: 'Ivanov' }, 2, 5);

      // Assert
      expect(fhirClient.search).toHaveBeenCalledWith('Practitioner', { name: 'Ivanov', _count: 5, _offset: 5, _total: 'accurate' });
    });

    it('should treat blank specialty and serviceId as absent when the query carries empty values', async () => {
      // Arrange
      fhirClient.search.mockResolvedValue({ entry: [] });

      // Act
      await doctorsService.list({ specialty: '  ', serviceId: '' });

      // Assert — an empty token would drop out of the URL and widen the role search to every doctor with a role.
      expect(fhirClient.search).toHaveBeenCalledWith('Practitioner', { _count: 20, _offset: 0, _total: 'accurate' });
    });
  });

  describe('list with a specialty filter', () => {
    it('should search PractitionerRole by specialty and include the practitioner when a specialty code is supplied', async () => {
      // Arrange
      fhirClient.search.mockResolvedValue(roleBundle([role('r1', 'Practitioner/101')], [practitioner('101', 'Ivanov')]));

      // Act
      const result = await doctorsService.list({ specialty: '419192003' });

      // Assert — R4 has no `Practitioner?qualification-code` (HAPI answers 400 HAPI-0524).
      expect(fhirClient.search).toHaveBeenCalledTimes(1);
      expect(fhirClient.search).toHaveBeenCalledWith('PractitionerRole', {
        specialty: '419192003',
        _include: 'PractitionerRole:practitioner',
        _count: 20,
        _offset: 0,
        _total: 'accurate',
      });
      expect(result.items).toEqual([
        { id: '101', name: 'Ivan Ivanov', firstName: 'Ivan', lastName: 'Ivanov', specialty: undefined },
      ]);
    });

    it('should pass a system|code token through unchanged when the specialty carries its code system', async () => {
      // Arrange
      fhirClient.search.mockResolvedValue({ entry: [] });

      // Act
      await doctorsService.list({ specialty: 'http://snomed.info/sct|394579002' });

      // Assert
      expect(fhirClient.search.mock.calls[0]?.[1]).toMatchObject({ specialty: 'http://snomed.info/sct|394579002' });
    });

    it('should never send qualification-code to HAPI when any filter is combined', async () => {
      // Arrange
      fhirClient.search.mockResolvedValue({ entry: [] });

      // Act
      await doctorsService.list({ specialty: 'x', serviceId: 'svc-1', search: 'Va' });
      await doctorsService.list({ specialty: 'x' });

      // Assert
      const sentParams = fhirClient.search.mock.calls.flatMap(([, params]) => Object.keys(params ?? {}));
      expect(sentParams).not.toContain('qualification-code');
    });
  });

  describe('list with a serviceId filter', () => {
    it('should search PractitionerRole by the HealthcareService reference when a serviceId is supplied', async () => {
      // Arrange
      fhirClient.search.mockResolvedValue(
        roleBundle(
          [role('r1', 'Practitioner/101'), role('r2', 'Practitioner/102')],
          [practitioner('102', 'Petrov'), practitioner('101', 'Ivanov')],
        ),
      );

      // Act
      const result = await doctorsService.list({ serviceId: 'svc-1' });

      // Assert — one request, no second Practitioner search; the order is the role order.
      expect(fhirClient.search).toHaveBeenCalledTimes(1);
      expect(fhirClient.search).toHaveBeenCalledWith('PractitionerRole', {
        service: 'HealthcareService/svc-1',
        _include: 'PractitionerRole:practitioner',
        _count: 20,
        _offset: 0,
        _total: 'accurate',
      });
      expect(result.items.map((doc) => doc.id)).toEqual(['101', '102']);
    });

    it('should combine service, specialty and a chained practitioner name when all three filters are supplied', async () => {
      // Arrange
      fhirClient.search.mockResolvedValue(roleBundle([role('r1', 'Practitioner/101')], [practitioner('101', 'Ivanov')]));

      // Act
      await doctorsService.list({ serviceId: 'svc-1', specialty: '419192003', search: 'Iva' }, 3, 10);

      // Assert
      expect(fhirClient.search).toHaveBeenCalledWith('PractitionerRole', {
        service: 'HealthcareService/svc-1',
        specialty: '419192003',
        'practitioner.name': 'Iva',
        _include: 'PractitionerRole:practitioner',
        _count: 10,
        _offset: 20,
        _total: 'accurate',
      });
    });
  });

  describe('pagination envelope', () => {
    it('should report the Bundle total in meta when a plain Practitioner search carries one', async () => {
      // Arrange
      fhirClient.search.mockResolvedValue({ total: 45, entry: [{ resource: practitioner('201', 'Sidorov') }] });

      // Act
      const result = await doctorsService.list({}, 2, 20);

      // Assert
      expect(result.meta).toEqual({ page: 2, pageSize: 20, totalItems: 45, totalPages: 3 });
      expect(result.items).toHaveLength(1);
    });

    it('should report the role total in meta when a filtered search carries one', async () => {
      // Arrange
      fhirClient.search.mockResolvedValue({
        ...roleBundle([role('r1', 'Practitioner/101')], [practitioner('101', 'Ivanov')]),
        total: 1,
      });

      // Act
      const result = await doctorsService.list({ specialty: '419192003' });

      // Assert
      expect(result.meta).toEqual({ page: 1, pageSize: 20, totalItems: 1, totalPages: 1 });
    });

    it('should count up to the current page when HAPI reports no total', async () => {
      // Arrange
      fhirClient.search.mockResolvedValue({ entry: [{ resource: practitioner('201', 'Sidorov') }] });

      // Act
      const result = await doctorsService.list({}, 3, 10);

      // Assert — 2 earlier pages of 10 plus the 1 row on this page.
      expect(result.meta).toEqual({ page: 3, pageSize: 10, totalItems: 21, totalPages: 3 });
    });

    it('should expose the display name next to firstName and lastName when a doctor is listed', async () => {
      // Arrange
      fhirClient.search.mockResolvedValue({ entry: [{ resource: practitioner('201', 'Sidorov') }] });

      // Act
      const result = await doctorsService.list({});

      // Assert
      expect(result.items[0]).toMatchObject({ name: 'Ivan Sidorov', firstName: 'Ivan', lastName: 'Sidorov' });
    });
  });

  describe('role bundle mapping', () => {
    it('should return an empty list when the role search matches nothing', async () => {
      // Arrange
      fhirClient.search.mockResolvedValue({ entry: [] });

      // Act
      const result = await doctorsService.list({ serviceId: 'svc-empty' });

      // Assert
      expect(result).toEqual({ items: [], meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
    });

    it('should list a practitioner once when two roles on the page point to the same practitioner', async () => {
      // Arrange
      fhirClient.search.mockResolvedValue(
        roleBundle([role('r1', 'Practitioner/101'), role('r2', 'Practitioner/101')], [practitioner('101', 'Ivanov')]),
      );

      // Act
      const result = await doctorsService.list({ specialty: 'x' });

      // Assert
      expect(result.items.map((doc) => doc.id)).toEqual(['101']);
    });

    it('should skip roles without a practitioner reference or without the included practitioner', async () => {
      // Arrange
      fhirClient.search.mockResolvedValue(
        roleBundle(
          [role('r1'), role('r2', 'Practitioner/missing'), role('r3', 'Practitioner/103')],
          [practitioner('103', 'Sidorov')],
        ),
      );

      // Act
      const result = await doctorsService.list({ serviceId: 'svc-1' });

      // Assert
      expect(result.items.map((doc) => doc.id)).toEqual(['103']);
    });

    it('should resolve an absolute practitioner reference when HAPI returns a full URL', async () => {
      // Arrange
      fhirClient.search.mockResolvedValue(
        roleBundle([role('r1', 'http://hapi:8080/fhir/Practitioner/101')], [practitioner('101', 'Ivanov')]),
      );

      // Act
      const result = await doctorsService.list({ serviceId: 'svc-1' });

      // Assert
      expect(result.items.map((doc) => doc.id)).toEqual(['101']);
    });
  });

  describe('findById', () => {
    it('should read the Practitioner and map it when the id is known', async () => {
      // Arrange
      fhirClient.read.mockResolvedValue(practitioner('101', 'Ivanov'));

      // Act
      const result = await doctorsService.findById('101');

      // Assert
      expect(fhirClient.read).toHaveBeenCalledWith('Practitioner', '101');
      expect(result).toMatchObject({ id: '101', name: 'Ivan Ivanov', lastName: 'Ivanov' });
    });
  });
});
