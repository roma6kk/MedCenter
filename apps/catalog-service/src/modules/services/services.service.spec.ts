import { BadRequestException, ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { ERROR_CODES } from '@medcenter/contracts';
import { FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';
import { FHIR_BY, MEDCENTER_EXT } from '@medcenter/terminology';

import { InMemoryCacheStore } from '../cache/__tests__/in-memory-cache-store';
import { auditedResource, committedAudit, committedEntries, transactionResponder } from '@medcenter/testing';
import { CACHE_KEYS, RedisCacheService } from '../cache/redis-cache.service';
import { ServicesService } from './services.service';

const ACTOR = { sub: 'admin-1', requestId: 'req-1' };

describe('ServicesService', () => {
  let servicesService: ServicesService;
  let fhirClient: jest.Mocked<FhirClient>;
  const serviceId = 'svc-1';
  const lookupFound = {
    resourceType: 'Parameters',
    parameter: [
      { name: 'name', valueString: 'nsi-services' },
      { name: 'display', valueString: 'Консультация терапевта' },
    ],
  };
  const lookupFailure = (status: number): FhirClientError =>
    new FhirClientError(
      'GET',
      'http://hapi/CodeSystem/$lookup',
      status,
      '{"resourceType":"OperationOutcome","issue":[{"diagnostics":"Unable to find code 999"}]}',
    );

  beforeEach(() => {
    fhirClient = {
      search: jest.fn(),
      read: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      operation: jest.fn(),
      batch: jest.fn().mockImplementation(transactionResponder()),
    } as unknown as jest.Mocked<FhirClient>;
    fhirClient.read.mockResolvedValue({ resourceType: 'HealthcareService', id: serviceId, name: 'Therapy' });
    servicesService = new ServicesService(fhirClient, new RedisCacheService());
  });

  describe('update', () => {
    const existing: FhirResource = {
      resourceType: 'HealthcareService',
      id: serviceId,
      name: 'Therapy',
      comment: 'Existing description',
      active: true,
      type: [
        {
          coding: [
            {
              system: FHIR_BY.SERVICE_CODE_SYSTEM,
              code: '01',
            },
          ],
        },
      ],
      extension: [{ url: MEDCENTER_EXT.SERVICE_DEFAULT_DURATION, valueInteger: 30 }],
    };

    it('does not blank fields omitted from the partial DTO', async () => {
      fhirClient.operation.mockResolvedValue(lookupFound);
      fhirClient.read.mockResolvedValue(existing);

      await servicesService.update(serviceId, { name: 'Renamed' }, ACTOR);

      const merged = (committedEntries(fhirClient)[0]?.resource ?? {}) as FhirResource;
      expect(merged['name']).toBe('Renamed');
      expect(merged['comment']).toBe('Existing description');
      expect(merged['active']).toBe(true);
      expect(merged['extension']).toEqual([
        { url: MEDCENTER_EXT.SERVICE_DEFAULT_DURATION, valueInteger: 30 },
      ]);
      expect(merged['type']).toEqual(existing['type']);
    });

    it('replaces the whole type coding on a partial typeCode PATCH', async () => {
      fhirClient.operation.mockResolvedValue(lookupFound);
      fhirClient.read.mockResolvedValue(existing);

      await servicesService.update(serviceId, { typeCode: '02' }, ACTOR);

      expect(fhirClient.operation).toHaveBeenCalledWith('CodeSystem', '$lookup', {
        system: FHIR_BY.SERVICE_CODE_SYSTEM,
        code: '02',
      });

      const merged = (committedEntries(fhirClient)[0]?.resource ?? {}) as FhirResource;
      expect(merged['type']).toEqual([
        { coding: [{ system: FHIR_BY.SERVICE_CODE_SYSTEM, code: '02', display: 'Консультация терапевта' }] },
      ]);
      expect(merged['comment']).toBe('Existing description');
    });

    it('replaces the type coding with the explicitly supplied typeSystem', async () => {
      fhirClient.operation.mockResolvedValue(lookupFound);
      fhirClient.read.mockResolvedValue(existing);

      await servicesService.update(serviceId, {
        typeSystem: 'https://fhir.by/CodeSystem/nsi-services',
        typeCode: '03',
      }, ACTOR);

      const merged = (committedEntries(fhirClient)[0]?.resource ?? {}) as FhirResource;
      expect(merged['type']).toEqual([
        {
          coding: [
            {
              system: 'https://fhir.by/CodeSystem/nsi-services',
              code: '03',
              display: 'Консультация терапевта',
            },
          ],
        },
      ]);
    });

    it.each([404, 400, 422])(
      'maps a HAPI %i $lookup answer to 422 TERMINOLOGY_NOT_FOUND before merging',
      async (status) => {
        fhirClient.read.mockResolvedValue(existing);
        fhirClient.operation.mockRejectedValue(lookupFailure(status));

        const error = await servicesService
          .update(serviceId, { typeCode: '999' }, ACTOR)
          .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect((error as Error).message).toContain('TERMINOLOGY_NOT_FOUND');
        expect(fhirClient.batch).not.toHaveBeenCalled();
      },
    );

    it('does not disguise a HAPI outage as an unknown code', async () => {
      fhirClient.read.mockResolvedValue(existing);
      fhirClient.operation.mockRejectedValue(lookupFailure(503));

      const error = await servicesService
        .update(serviceId, { typeCode: '02' }, ACTOR)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(FhirClientError);
      expect((error as FhirClientError).getStatus()).toBe(502);
      expect(fhirClient.batch).not.toHaveBeenCalled();
    });

    it('rejects a typeSystem-only PATCH instead of blanking the stored code', async () => {
      fhirClient.read.mockResolvedValue(existing);

      const error = await servicesService
        .update(serviceId, { typeSystem: FHIR_BY.SERVICE_CODE_SYSTEM }, ACTOR)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(fhirClient.operation).not.toHaveBeenCalled();
      expect(fhirClient.batch).not.toHaveBeenCalled();
    });

    it('keeps stored defaults when only the description changes', async () => {
      fhirClient.operation.mockResolvedValue(lookupFound);
      fhirClient.read.mockResolvedValue(existing);

      await expect(
        servicesService.update(serviceId, { description: 'Updated' }, ACTOR),
      ).resolves.toMatchObject({ id: serviceId });
    });
  });

  describe('list', () => {
    const catalogBundle = { entry: [{ resource: { resourceType: 'HealthcareService', id: serviceId, name: 'Therapy' } }] };
    let store: InMemoryCacheStore;

    beforeEach(() => {
      store = new InMemoryCacheStore();
      servicesService = new ServicesService(fhirClient, new RedisCacheService(store));
      fhirClient.search.mockResolvedValue(catalogBundle);
    });

    it('should cache the plain listing under one key per page when no search term is given', async () => {
      await servicesService.list(2, 20);
      await servicesService.list(2, 20);

      expect(fhirClient.search).toHaveBeenCalledTimes(1);
      expect([...store.entries.keys()]).toEqual([CACHE_KEYS.SERVICES_PAGE(2, 20)]);
    });

    it('should not cache anything when a search term is given', async () => {
      await servicesService.list(1, 20, 'терапевт');
      await servicesService.list(1, 20, 'терапевт');

      expect(fhirClient.search).toHaveBeenCalledTimes(2);
      expect(store.entries.size).toBe(0);
      expect(fhirClient.search).toHaveBeenCalledWith('HealthcareService', {
        name: 'терапевт',
        'active:not': 'false',
        _count: 20,
        _offset: 0,
        _total: 'accurate',
      });
    });

    it('should treat a blank search term as the plain listing when only whitespace is sent', async () => {
      await servicesService.list(1, 20, '   ');

      expect([...store.entries.keys()]).toEqual([CACHE_KEYS.SERVICES_PAGE(1, 20)]);
      expect(fhirClient.search).toHaveBeenCalledWith('HealthcareService', { 'active:not': 'false', _count: 20, _offset: 0, _total: 'accurate' });
    });

    it('should clear every cached page when a service is created', async () => {
      fhirClient.operation.mockResolvedValue(lookupFound);
      await servicesService.list(1, 20);
      await servicesService.list(2, 20);

      await servicesService.create({
        name: 'New',
        typeSystem: FHIR_BY.SERVICE_CODE_SYSTEM,
        typeCode: '01',
        defaultDurationMin: 30,
      }, ACTOR);

      expect(store.entries.size).toBe(0);
    });
  });

  describe('remove', () => {
    it('refuses to delete a service referenced by an active schedule', async () => {
      fhirClient.search.mockResolvedValue({ entry: [{ resource: { resourceType: 'Schedule' } }] });

      await expect(servicesService.remove(serviceId, ACTOR)).rejects.toThrow('SERVICE_IN_USE');
      await expect(servicesService.remove(serviceId, ACTOR)).rejects.toBeInstanceOf(ConflictException);
      expect(fhirClient.batch).not.toHaveBeenCalled();
    });

    it('should throw the catalogued SERVICE_IN_USE error code when a schedule references the service', async () => {
      fhirClient.search.mockResolvedValue({ entry: [{ resource: { resourceType: 'Schedule' } }] });

      const error = await servicesService.remove(serviceId, ACTOR).then(
        () => undefined,
        (e: unknown) => e as ConflictException,
      );

      const { errorCode } = error?.getResponse() as { errorCode: string };
      expect(errorCode).toBe('SERVICE_IN_USE');
      expect(ERROR_CODES).toContain(errorCode);
    });

    it('should look up referencing schedules through Schedule.actor when the delete is checked', async () => {
      fhirClient.search.mockResolvedValue({ entry: [] });

      await servicesService.remove(serviceId, ACTOR);

      expect(fhirClient.search).toHaveBeenCalledWith('Schedule', {
        actor: `HealthcareService/${serviceId}`,
        _count: 1,
      });
      expect(committedEntries(fhirClient).map((entry) => `${entry.request.method} ${entry.request.url}`)).toEqual([`DELETE HealthcareService/${serviceId}`, 'POST AuditEvent']);
    });
  });

  describe('audit (FR-021, ADR-014)', () => {
    it('should write the create AuditEvent of the new service in the same transaction, with the actor and the request id', async () => {
      fhirClient.operation.mockResolvedValue(lookupFound);

      const created = await servicesService.create(
        { name: 'New', typeSystem: FHIR_BY.SERVICE_CODE_SYSTEM, typeCode: '01', defaultDurationMin: 30 },
        ACTOR,
      );

      expect(created).toMatchObject({ id: expect.any(String), name: 'New' });
      const [service, audit] = committedEntries(fhirClient);
      expect(service?.request).toMatchObject({ method: 'PUT', url: `HealthcareService/${created.id}` });
      expect(audit?.request).toMatchObject({ method: 'POST', url: 'AuditEvent' });
      expect(committedAudit(fhirClient)).toMatchObject({
        action: 'C',
        subtype: [{ code: 'create' }],
        agent: [{ who: { identifier: { value: 'admin-1' } }, requestor: true }],
        source: { observer: { display: 'catalog-service' } },
        entity: [auditedResource('HealthcareService', service?.resource?.id), { what: { identifier: { value: 'req-1' } } }],
      });
    });

    it('should write the update AuditEvent of the service in the same transaction as the change', async () => {
      await servicesService.update(serviceId, { name: 'Renamed' }, ACTOR);

      expect(committedEntries(fhirClient).map((entry) => `${entry.request.method} ${entry.request.url}`)).toEqual([`PUT HealthcareService/${serviceId}`, 'POST AuditEvent']);
      expect(committedAudit(fhirClient)).toMatchObject({ action: 'U', subtype: [{ code: 'update' }], entity: [auditedResource('HealthcareService', serviceId), expect.anything()] });
    });

    it('should write the delete AuditEvent of the service in the same transaction as the delete', async () => {
      fhirClient.search.mockResolvedValue({ entry: [] });

      await servicesService.remove(serviceId, ACTOR);

      expect(committedAudit(fhirClient)).toMatchObject({ action: 'D', subtype: [{ code: 'delete' }], entity: [auditedResource('HealthcareService', serviceId), expect.anything()] });
    });

    it('should write nothing when the terminology check refuses the create', async () => {
      fhirClient.operation.mockRejectedValue(lookupFailure(404));

      await expect(servicesService.create({ name: 'New', typeSystem: FHIR_BY.SERVICE_CODE_SYSTEM, typeCode: '999', defaultDurationMin: 30 }, ACTOR)).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(fhirClient.batch).not.toHaveBeenCalled();
    });
  });
});
