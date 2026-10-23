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

function bundle(...resources: readonly FhirResource[]): { entry: { resource: FhirResource }[] } {
  return { entry: resources.map((resource) => ({ resource })) };
}

/** The id-only role scan of a filtered list (`_elements=practitioner`), then the Practitioners of the page. */
function mockRoleFilter(fhirClient: jest.Mocked<FhirClient>, roles: readonly FhirResource[], practitioners: readonly FhirResource[]): void {
  fhirClient.search.mockImplementation((resourceType) =>
    Promise.resolve(resourceType === 'PractitionerRole' ? bundle(...roles) : resourceType === 'Practitioner' ? bundle(...practitioners) : { entry: [] }),
  );
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
      expect(fhirClient.search).toHaveBeenCalledTimes(2); // the page, then the roles of its doctors (see doctors.service.roles.spec.ts)
      expect(fhirClient.search).toHaveBeenNthCalledWith(1, 'Practitioner', { _count: 20, _offset: 0, _total: 'accurate' });
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
      mockRoleFilter(fhirClient, [role('r1', 'Practitioner/101')], [practitioner('101', 'Ivanov')]);

      // Act
      const result = await doctorsService.list({ specialty: '419192003' });

      // Assert — R4 has no `Practitioner?qualification-code` (HAPI answers 400 HAPI-0524).
      expect(fhirClient.search).toHaveBeenCalledTimes(3); // the role scan, the page's Practitioners, the roles of those doctors
      expect(fhirClient.search).toHaveBeenNthCalledWith(1, 'PractitionerRole', { specialty: '419192003', _elements: 'practitioner', _count: 1000 });
      expect(fhirClient.search).toHaveBeenNthCalledWith(2, 'Practitioner', { _id: '101', _count: 1 });
      expect(result.items).toEqual([
        { id: '101', name: 'Ivan Ivanov', firstName: 'Ivan', lastName: 'Ivanov', specialty: undefined, practitionerRoleIds: ['r1'] },
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
      mockRoleFilter(
        fhirClient,
        [role('r1', 'Practitioner/101'), role('r2', 'Practitioner/102')],
        [practitioner('102', 'Petrov'), practitioner('101', 'Ivanov')],
      );

      // Act
      const result = await doctorsService.list({ serviceId: 'svc-1' });

      // Assert — the role scan, the page's Practitioners (asked by id), then their roles; the order is the role order.
      expect(fhirClient.search).toHaveBeenCalledTimes(3);
      expect(fhirClient.search).toHaveBeenNthCalledWith(1, 'PractitionerRole', {
        service: 'HealthcareService/svc-1',
        _elements: 'practitioner',
        _count: 1000,
      });
      expect(fhirClient.search).toHaveBeenNthCalledWith(2, 'Practitioner', { _id: '101,102', _count: 2 });
      expect(result.items.map((doc) => doc.id)).toEqual(['101', '102']);
    });

    it('should combine service, specialty and a chained practitioner name when all three filters are supplied', async () => {
      // Arrange
      mockRoleFilter(fhirClient, [role('r1', 'Practitioner/101')], [practitioner('101', 'Ivanov')]);

      // Act
      await doctorsService.list({ serviceId: 'svc-1', specialty: '419192003', search: 'Iva' }, 3, 10);

      // Assert — the filters go to the scan; paging is applied to the doctors, not sent to HAPI.
      expect(fhirClient.search).toHaveBeenCalledWith('PractitionerRole', {
        service: 'HealthcareService/svc-1',
        specialty: '419192003',
        'practitioner.name': 'Iva',
        _elements: 'practitioner',
        _count: 1000,
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

    it('should report the doctor total in meta when a filtered search matches a doctor', async () => {
      // Arrange
      mockRoleFilter(fhirClient, [role('r1', 'Practitioner/101')], [practitioner('101', 'Ivanov')]);

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

  describe('role scan mapping', () => {
    it('should return an empty list when the role search matches nothing', async () => {
      // Arrange
      fhirClient.search.mockResolvedValue({ entry: [] });

      // Act
      const result = await doctorsService.list({ serviceId: 'svc-empty' });

      // Assert
      expect(result).toEqual({ items: [], meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
    });

    it('should list a practitioner once when two roles point to the same practitioner', async () => {
      // Arrange
      mockRoleFilter(fhirClient, [role('r1', 'Practitioner/101'), role('r2', 'Practitioner/101')], [practitioner('101', 'Ivanov')]);

      // Act
      const result = await doctorsService.list({ specialty: 'x' });

      // Assert
      expect(result.items.map((doc) => doc.id)).toEqual(['101']);
      expect(result.meta.totalItems).toBe(1);
    });

    it('should skip roles without a practitioner reference', async () => {
      // Arrange
      mockRoleFilter(fhirClient, [role('r1'), role('r3', 'Practitioner/103')], [practitioner('103', 'Sidorov')]);

      // Act
      const result = await doctorsService.list({ serviceId: 'svc-1' });

      // Assert
      expect(result.items.map((doc) => doc.id)).toEqual(['103']);
      expect(result.meta.totalItems).toBe(1);
    });

    it('should resolve an absolute practitioner reference when HAPI returns a full URL', async () => {
      // Arrange
      mockRoleFilter(fhirClient, [role('r1', 'http://hapi:8080/fhir/Practitioner/101')], [practitioner('101', 'Ivanov')]);

      // Act
      const result = await doctorsService.list({ serviceId: 'svc-1' });

      // Assert
      expect(result.items.map((doc) => doc.id)).toEqual(['101']);
    });

    it('should drop a doctor HAPI no longer returns by id', async () => {
      // Arrange
      mockRoleFilter(fhirClient, [role('r1', 'Practitioner/101'), role('r2', 'Practitioner/gone')], [practitioner('101', 'Ivanov')]);

      // Act
      const result = await doctorsService.list({ serviceId: 'svc-1' });

      // Assert
      expect(result.items.map((doc) => doc.id)).toEqual(['101']);
    });
  });

  describe('paging doctors, not roles, when a role filter is supplied', () => {
    /** The two-step search: the id-only role scan first, then the Practitioners of the requested page. */
    function mockRoleScanThenPractitioners(): void {
      fhirClient.search.mockImplementation((resourceType, params) => {
        if (resourceType === 'PractitionerRole' && params?.['_elements'] === 'practitioner') {
          return Promise.resolve({
            entry: [role('r1', 'Practitioner/101'), role('r2', 'Practitioner/101'), role('r3', 'Practitioner/102'), role('r4', 'Practitioner/103')].map((resource) => ({ resource })),
          });
        }
        if (resourceType === 'Practitioner') {
          const ids = String(params?.['_id']).split(',');
          return Promise.resolve({ entry: ids.reverse().map((id) => ({ resource: practitioner(id, `Doc${id}`) })) });
        }
        return Promise.resolve({ entry: [] });
      });
    }

    it('should count doctors, not roles, in totalItems when one doctor holds two matching roles', async () => {
      // Arrange
      mockRoleScanThenPractitioners();

      // Act
      const result = await doctorsService.list({ specialty: 'x' }, 1, 2);

      // Assert — 4 roles, 3 doctors; the first page holds doctors 101 and 102 (not 101 listed once of two roles).
      expect(result.meta).toEqual({ page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });
      expect(result.items.map((doc) => doc.id)).toEqual(['101', '102']);
    });

    it('should return the remaining doctors on the next page in role order', async () => {
      // Arrange
      mockRoleScanThenPractitioners();

      // Act
      const result = await doctorsService.list({ specialty: 'x' }, 2, 2);

      // Assert
      expect(result.meta).toEqual({ page: 2, pageSize: 2, totalItems: 3, totalPages: 2 });
      expect(result.items.map((doc) => doc.id)).toEqual(['103']);
    });

    it('should not search Practitioner when the requested page is past the last doctor', async () => {
      // Arrange
      mockRoleScanThenPractitioners();

      // Act
      const result = await doctorsService.list({ specialty: 'x' }, 5, 2);

      // Assert
      expect(result.items).toEqual([]);
      expect(result.meta.totalItems).toBe(3);
      expect(fhirClient.search.mock.calls.filter(([type]) => type === 'Practitioner')).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should read the Practitioner and map it when the id is known', async () => {
      // Arrange
      fhirClient.read.mockResolvedValue(practitioner('101', 'Ivanov'));
      fhirClient.search.mockResolvedValue({ entry: [] });

      // Act
      const result = await doctorsService.findById('101');

      // Assert
      expect(fhirClient.read).toHaveBeenCalledWith('Practitioner', '101');
      expect(result).toMatchObject({ id: '101', name: 'Ivan Ivanov', lastName: 'Ivanov' });
    });
  });
});
