import { FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';
import { translationExtension } from '@medcenter/fhir-mappers';

import { bundle, fhirClientMock } from '../../__tests__/fhir-fixture';
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

function scheduleOf(...roles: readonly FhirResource[]): FhirResource {
  return { resourceType: 'Schedule', id: 'sch', actor: roles.map((r) => ({ reference: `PractitionerRole/${r.id}` })) };
}

function mockRoleFilter(fhirClient: jest.Mocked<FhirClient>, roles: readonly FhirResource[], practitioners: readonly FhirResource[]): void {
  fhirClient.search.mockImplementation((resourceType) =>
    Promise.resolve(
      resourceType === 'Schedule'
        ? bundle(scheduleOf(...roles))
        : resourceType === 'PractitionerRole'
          ? bundle(...roles)
          : resourceType === 'Practitioner'
            ? bundle(...practitioners)
            : { entry: [] },
    ),
  );
}

describe('DoctorsService', () => {
  let doctorsService: DoctorsService;
  let fhirClient: jest.Mocked<FhirClient>;

  beforeEach(() => {
    fhirClient = fhirClientMock();
    doctorsService = new DoctorsService(fhirClient);
  });

  describe('list without a role filter', () => {
    it('should search Practitioner with the page window when no filter is supplied', async () => {
      fhirClient.search.mockResolvedValue({ entry: [{ resource: practitioner('201', 'Sidorov') }] });

      const result = await doctorsService.list({});

      expect(result.items.map((doc) => doc.id)).toEqual(['201']);
      expect(fhirClient.search).toHaveBeenCalledTimes(2);
      expect(fhirClient.search).toHaveBeenNthCalledWith(1, 'Practitioner', { 'active:not': 'false', _count: 20, _offset: 0, _total: 'accurate' });
    });

    it('should scan the Practitioners and match the name here when only a search term is supplied', async () => {
      fhirClient.search.mockImplementation((resourceType) =>
        Promise.resolve(
          resourceType === 'Practitioner'
            ? bundle(practitioner('101', 'Ivanov'), practitioner('102', 'Petrov'), practitioner('103', 'Ivanova'))
            : { entry: [] },
        ),
      );

      const result = await doctorsService.list({ search: 'Ivanov' }, 1, 1);

      expect(fhirClient.search).toHaveBeenNthCalledWith(1, 'Practitioner', { 'active:not': 'false', _count: 100, _offset: 0 });
      expect(result.items.map((doc) => doc.id)).toEqual(['101']);
      expect(result.meta).toEqual({ page: 1, pageSize: 1, totalItems: 2, totalPages: 2 });
    });

    it('should walk the Practitioner scan in chunks of 100 until HAPI runs out', async () => {
      const all = Array.from({ length: 105 }, (_, index) => practitioner(`d${index}`, `Doc${index}`));
      fhirClient.search.mockImplementation((resourceType, params) =>
        Promise.resolve(resourceType === 'Practitioner' ? bundle(...all.slice(Number(params?.['_offset']), Number(params?.['_offset']) + 100)) : { entry: [] }),
      );

      const result = await doctorsService.list({ search: 'Doc' }, 6, 20);

      expect(fhirClient.search.mock.calls.filter(([type]) => type === 'Practitioner').map(([, params]) => params?.['_offset'])).toEqual([0, 100]);
      expect(result.meta).toEqual({ page: 6, pageSize: 20, totalItems: 105, totalPages: 6 });
      expect(result.items).toHaveLength(5);
    });

    it('should find a doctor by the English name and by the full name of the card, in either language of the page', async () => {
      const ivanova = {
        resourceType: 'Practitioner',
        id: '201',
        name: [{ family: 'Иванова', _family: { extension: [translationExtension('en', 'Ivanova')] }, given: ['Мария'], _given: [{ extension: [translationExtension('en', 'Maria')] }] }],
      };
      fhirClient.search.mockImplementation((resourceType) => Promise.resolve(resourceType === 'Practitioner' ? bundle(ivanova, practitioner('202', 'Petrov')) : { entry: [] }));

      for (const [term, lang] of [['Ivanova', 'en'], ['Maria Ivanova', 'en'], ['Мария Иванова', 'ru'], ['Иванова Мария', 'en'], ['Maria', 'ru']] as const) {
        const result = await doctorsService.list({ search: term }, 1, 20, lang);
        expect(result.items.map((doc) => doc.id)).toEqual(['201']);
      }
    });

    it('should answer an empty page with no total when no doctor matches the name', async () => {
      fhirClient.search.mockResolvedValue(bundle(practitioner('101', 'Ivanov')));

      const result = await doctorsService.list({ search: 'Nobody' });

      expect(result).toEqual({ items: [], meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
    });

    it('should treat blank specialty and serviceId as absent when the query carries empty values', async () => {
      fhirClient.search.mockResolvedValue({ entry: [] });

      await doctorsService.list({ specialty: '  ', serviceId: '' });

      expect(fhirClient.search).toHaveBeenCalledWith('Practitioner', { 'active:not': 'false', _count: 20, _offset: 0, _total: 'accurate' });
    });
  });

  describe('list with a specialty filter', () => {
    it('should search PractitionerRole by specialty and include the practitioner when a specialty code is supplied', async () => {
      mockRoleFilter(fhirClient, [role('r1', 'Practitioner/101')], [practitioner('101', 'Ivanov')]);

      const result = await doctorsService.list({ specialty: '419192003' });

      expect(fhirClient.search).toHaveBeenCalledTimes(3);
      expect(fhirClient.search).toHaveBeenNthCalledWith(1, 'PractitionerRole', { specialty: '419192003', 'active:not': 'false', _elements: 'practitioner', _count: 1000 });
      expect(fhirClient.search).toHaveBeenNthCalledWith(2, 'Practitioner', { _id: '101', 'active:not': 'false', _count: 1 });
      expect(result.items).toEqual([
        { id: '101', name: 'Ivan Ivanov', firstName: 'Ivan', lastName: 'Ivanov', specialty: undefined, practitionerRoleIds: ['r1'] },
      ]);
    });

    it('should pass a system|code token through unchanged when the specialty carries its code system', async () => {
      fhirClient.search.mockResolvedValue({ entry: [] });

      await doctorsService.list({ specialty: 'http://snomed.info/sct|394579002' });

      expect(fhirClient.search.mock.calls[0]?.[1]).toMatchObject({ specialty: 'http://snomed.info/sct|394579002' });
    });

    it('should never send qualification-code to HAPI when any filter is combined', async () => {
      fhirClient.search.mockResolvedValue({ entry: [] });

      await doctorsService.list({ specialty: 'x', serviceId: 'svc-1', search: 'Va' });
      await doctorsService.list({ specialty: 'x' });

      const sentParams = fhirClient.search.mock.calls.flatMap(([, params]) => Object.keys(params ?? {}));
      expect(sentParams).not.toContain('qualification-code');
    });
  });

  describe('list with a serviceId filter', () => {
    it('should find the roles of a service through its active schedules when a serviceId is supplied', async () => {
      mockRoleFilter(
        fhirClient,
        [role('r1', 'Practitioner/101'), role('r2', 'Practitioner/102')],
        [practitioner('102', 'Petrov'), practitioner('101', 'Ivanov')],
      );

      const result = await doctorsService.list({ serviceId: 'svc-1' });

      expect(fhirClient.search).toHaveBeenCalledTimes(4);
      expect(fhirClient.search).toHaveBeenNthCalledWith(1, 'Schedule', {
        actor: 'HealthcareService/svc-1',
        'active:not': 'false',
        _elements: 'actor',
        _count: 1000,
      });
      expect(fhirClient.search).toHaveBeenNthCalledWith(2, 'PractitionerRole', {
        _id: 'r1,r2',
        'active:not': 'false',
        _elements: 'practitioner',
        _count: 1000,
      });
      expect(fhirClient.search).toHaveBeenNthCalledWith(3, 'Practitioner', { _id: '101,102', 'active:not': 'false', _count: 2 });
      expect(result.items.map((doc) => doc.id)).toEqual(['101', '102']);
    });

    it('should keep the name out of the role scan and match it on the doctors the other filters left', async () => {
      mockRoleFilter(fhirClient, [role('r1', 'Practitioner/101'), role('r2', 'Practitioner/102')], [practitioner('101', 'Ivanov'), practitioner('102', 'Petrov')]);

      const result = await doctorsService.list({ serviceId: 'svc-1', specialty: '419192003', search: 'Ivano' }, 1, 10);

      expect(fhirClient.search).toHaveBeenCalledWith('PractitionerRole', {
        _id: 'r1,r2',
        specialty: '419192003',
        'active:not': 'false',
        _elements: 'practitioner',
        _count: 1000,
      });
      expect(result.items.map((doc) => doc.id)).toEqual(['101']);
      expect(result.meta.totalItems).toBe(1);
    });
  });

  describe('doctors of a service without the PractitionerRole.healthcareService link', () => {
    it('should list the doctor of a service that only has a schedule, the link is not read', async () => {
      mockRoleFilter(fhirClient, [role('r1', 'Practitioner/101')], [practitioner('101', 'Ivanov')]);

      const result = await doctorsService.list({ serviceId: 'new-svc' });

      expect(result.items.map((doc) => doc.id)).toEqual(['101']);
      expect(fhirClient.search).not.toHaveBeenCalledWith('PractitionerRole', expect.objectContaining({ service: expect.anything() }));
    });

    it('should list no doctor and ask no role when the service has no active schedule', async () => {
      fhirClient.search.mockResolvedValue({ entry: [] });

      const result = await doctorsService.list({ serviceId: 'svc-1', specialty: '419192003' });

      expect(result.items).toEqual([]);
      expect(fhirClient.search).toHaveBeenCalledTimes(1);
    });

    it('should ignore schedule actors that are not doctor roles and keep each role once', async () => {
      fhirClient.search.mockImplementation((resourceType) =>
        Promise.resolve(
          resourceType === 'Schedule'
            ? {
                entry: [
                  { resource: { resourceType: 'Schedule', actor: [{ reference: 'HealthcareService/svc-1' }, { reference: 'PractitionerRole/r1' }, { reference: 'Location/loc' }] } },
                  { resource: { resourceType: 'Schedule', actor: [{ reference: 'http://hapi:8080/fhir/PractitionerRole/r1' }] } },
                ],
              }
            : resourceType === 'PractitionerRole'
              ? bundle(role('r1', 'Practitioner/101'))
              : bundle(practitioner('101', 'Ivanov')),
        ),
      );

      await doctorsService.list({ serviceId: 'svc-1' });

      expect(fhirClient.search).toHaveBeenNthCalledWith(2, 'PractitionerRole', expect.objectContaining({ _id: 'r1' }));
    });
  });

  describe('pagination envelope', () => {
    it('should report the Bundle total in meta when a plain Practitioner search carries one', async () => {
      fhirClient.search.mockResolvedValue({ total: 45, entry: [{ resource: practitioner('201', 'Sidorov') }] });

      const result = await doctorsService.list({}, 2, 20);

      expect(result.meta).toEqual({ page: 2, pageSize: 20, totalItems: 45, totalPages: 3 });
      expect(result.items).toHaveLength(1);
    });

    it('should report the doctor total in meta when a filtered search matches a doctor', async () => {
      mockRoleFilter(fhirClient, [role('r1', 'Practitioner/101')], [practitioner('101', 'Ivanov')]);

      const result = await doctorsService.list({ specialty: '419192003' });

      expect(result.meta).toEqual({ page: 1, pageSize: 20, totalItems: 1, totalPages: 1 });
    });

    it('should count up to the current page when HAPI reports no total', async () => {
      fhirClient.search.mockResolvedValue({ entry: [{ resource: practitioner('201', 'Sidorov') }] });

      const result = await doctorsService.list({}, 3, 10);

      expect(result.meta).toEqual({ page: 3, pageSize: 10, totalItems: 21, totalPages: 3 });
    });

    it('should expose the display name next to firstName and lastName when a doctor is listed', async () => {
      fhirClient.search.mockResolvedValue({ entry: [{ resource: practitioner('201', 'Sidorov') }] });

      const result = await doctorsService.list({});

      expect(result.items[0]).toMatchObject({ name: 'Ivan Sidorov', firstName: 'Ivan', lastName: 'Sidorov' });
    });
  });

  describe('role scan mapping', () => {
    it('should return an empty list when the role search matches nothing', async () => {
      fhirClient.search.mockResolvedValue({ entry: [] });

      const result = await doctorsService.list({ serviceId: 'svc-empty' });

      expect(result).toEqual({ items: [], meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
    });

    it('should list a practitioner once when two roles point to the same practitioner', async () => {
      mockRoleFilter(fhirClient, [role('r1', 'Practitioner/101'), role('r2', 'Practitioner/101')], [practitioner('101', 'Ivanov')]);

      const result = await doctorsService.list({ specialty: 'x' });

      expect(result.items.map((doc) => doc.id)).toEqual(['101']);
      expect(result.meta.totalItems).toBe(1);
    });

    it('should skip roles without a practitioner reference', async () => {
      mockRoleFilter(fhirClient, [role('r1'), role('r3', 'Practitioner/103')], [practitioner('103', 'Sidorov')]);

      const result = await doctorsService.list({ serviceId: 'svc-1' });

      expect(result.items.map((doc) => doc.id)).toEqual(['103']);
      expect(result.meta.totalItems).toBe(1);
    });

    it('should resolve an absolute practitioner reference when HAPI returns a full URL', async () => {
      mockRoleFilter(fhirClient, [role('r1', 'http://hapi:8080/fhir/Practitioner/101')], [practitioner('101', 'Ivanov')]);

      const result = await doctorsService.list({ serviceId: 'svc-1' });

      expect(result.items.map((doc) => doc.id)).toEqual(['101']);
    });

    it('should drop a doctor HAPI no longer returns by id', async () => {
      mockRoleFilter(fhirClient, [role('r1', 'Practitioner/101'), role('r2', 'Practitioner/gone')], [practitioner('101', 'Ivanov')]);

      const result = await doctorsService.list({ serviceId: 'svc-1' });

      expect(result.items.map((doc) => doc.id)).toEqual(['101']);
    });
  });

  describe('paging doctors, not roles, when a role filter is supplied', () => {
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
      mockRoleScanThenPractitioners();

      const result = await doctorsService.list({ specialty: 'x' }, 1, 2);

      expect(result.meta).toEqual({ page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });
      expect(result.items.map((doc) => doc.id)).toEqual(['101', '102']);
    });

    it('should return the remaining doctors on the next page in role order', async () => {
      mockRoleScanThenPractitioners();

      const result = await doctorsService.list({ specialty: 'x' }, 2, 2);

      expect(result.meta).toEqual({ page: 2, pageSize: 2, totalItems: 3, totalPages: 2 });
      expect(result.items.map((doc) => doc.id)).toEqual(['103']);
    });

    it('should leave a deactivated doctor out of the page and of the total when HAPI does not return the Practitioner', async () => {
      fhirClient.search.mockImplementation((resourceType) =>
        Promise.resolve(
          resourceType === 'PractitionerRole'
            ? bundle(role('r1', 'Practitioner/101'), role('r2', 'Practitioner/102'), role('r3', 'Practitioner/103'))
            : resourceType === 'Practitioner'
              ? bundle(practitioner('101', 'Ivanov'), practitioner('103', 'Sidorov'))
              : { entry: [] },
        ),
      );

      const result = await doctorsService.list({ specialty: 'x' }, 1, 2);

      expect(result.items.map((doc) => doc.id)).toEqual(['101', '103']);
      expect(result.meta).toEqual({ page: 1, pageSize: 2, totalItems: 2, totalPages: 1 });
    });

    it('should look the doctors up in chunks of 100 ids when a filter matches more of them', async () => {
      const ids = Array.from({ length: 250 }, (_, index) => `d${index}`);
      fhirClient.search.mockImplementation((resourceType, params) => {
        if (resourceType === 'PractitionerRole') {
          return Promise.resolve(bundle(...ids.map((id) => role(`r-${id}`, `Practitioner/${id}`))));
        }
        return Promise.resolve(resourceType === 'Practitioner' ? bundle(...String(params?.['_id']).split(',').map((id) => practitioner(id, id))) : { entry: [] });
      });

      const result = await doctorsService.list({ specialty: 'x' }, 3, 100);

      const lookups = fhirClient.search.mock.calls.filter(([type]) => type === 'Practitioner').map(([, params]) => String(params?.['_id']).split(',').length);
      expect(lookups).toEqual([100, 100, 50]);
      expect(result.meta).toEqual({ page: 3, pageSize: 100, totalItems: 250, totalPages: 3 });
      expect(result.items).toHaveLength(50);
    });

    it('should answer an empty page without looking up roles when the requested page is past the last doctor', async () => {
      mockRoleScanThenPractitioners();

      const result = await doctorsService.list({ specialty: 'x' }, 5, 2);

      expect(result.items).toEqual([]);
      expect(result.meta.totalItems).toBe(3);
      expect(fhirClient.search.mock.calls.map(([type]) => type)).toEqual(['PractitionerRole', 'Practitioner']);
    });
  });

  describe('findById', () => {
    it('should read the Practitioner and map it when the id is known', async () => {
      fhirClient.read.mockResolvedValue(practitioner('101', 'Ivanov'));
      fhirClient.search.mockResolvedValue({ entry: [] });

      const result = await doctorsService.findById('101');

      expect(fhirClient.read).toHaveBeenCalledWith('Practitioner', '101');
      expect(result).toMatchObject({ id: '101', name: 'Ivan Ivanov', lastName: 'Ivanov' });
    });

    it.each([['active=true', true], ['no active element', undefined]])('should answer the doctor when the Practitioner has %s', async (_label, active) => {
      fhirClient.read.mockResolvedValue({ ...practitioner('101', 'Ivanov'), ...(active === undefined ? {} : { active }) });
      fhirClient.search.mockResolvedValue({ entry: [] });

      await expect(doctorsService.findById('101')).resolves.toMatchObject({ id: '101' });
    });

    it('should answer 404 with the body of an unknown id when the Practitioner is deactivated', async () => {
      fhirClient.read.mockResolvedValue({ ...practitioner('101', 'Ivanov'), active: false });

      const error = await doctorsService.findById('101').then(
        () => undefined,
        (e: unknown) => e as FhirClientError,
      );

      expect(error).toBeInstanceOf(FhirClientError);
      expect(error?.getStatus()).toBe(404);
      expect(error?.getResponse()).toEqual(new FhirClientError('GET', 'http://hapi/Practitioner/101', 404, '{}').getResponse());
      expect(fhirClient.search).not.toHaveBeenCalled();
    });
  });
});
