import { BadRequestException, ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';
import { FHIR_BY, MEDCENTER_EXT } from '@medcenter/terminology';

import { InMemoryCacheStore } from '../cache/__tests__/in-memory-cache-store';
import { CACHE_KEYS, RedisCacheService } from '../cache/redis-cache.service';
import { ServicesService } from './services.service';

describe('ServicesService', () => {
  let servicesService: ServicesService;
  let fhirClient: jest.Mocked<FhirClient>;
  const serviceId = 'svc-1';
  // HAPI `CodeSystem/$lookup`: a known concept -> 200 Parameters ...
  const lookupFound = {
    resourceType: 'Parameters',
    parameter: [
      { name: 'name', valueString: 'nsi-services' },
      { name: 'display', valueString: 'Консультация терапевта' },
    ],
  };
  // ... an unknown code -> 4xx OperationOutcome, never an empty Parameters.
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
      batch: jest.fn(),
    } as unknown as jest.Mocked<FhirClient>;
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
      fhirClient.update.mockResolvedValue(existing);

      await servicesService.update(serviceId, { name: 'Renamed' });

      const merged = fhirClient.update.mock.calls[0][2];
      expect(merged['name']).toBe('Renamed');
      // Untouched DTO fields must keep their stored values.
      expect(merged['comment']).toBe('Existing description');
      expect(merged['active']).toBe(true);
      expect(merged['extension']).toEqual([
        { url: MEDCENTER_EXT.SERVICE_DEFAULT_DURATION, valueInteger: 30 },
      ]);
      // typeCode was absent -> the existing coding survives as-is.
      expect(merged['type']).toEqual(existing['type']);
    });

    it('replaces the whole type coding on a partial typeCode PATCH', async () => {
      fhirClient.operation.mockResolvedValue(lookupFound);
      fhirClient.read.mockResolvedValue(existing);
      fhirClient.update.mockResolvedValue({ ...existing, name: existing['name'] });

      await servicesService.update(serviceId, { typeCode: '02' });

      // The validation must hit CodeSystem/$lookup, not a CodeSystem search
      // (`code` is not a search parameter there — the old request never matched).
      expect(fhirClient.operation).toHaveBeenCalledWith('CodeSystem', '$lookup', {
        system: FHIR_BY.SERVICE_CODE_SYSTEM,
        code: '02',
      });

      const merged = fhirClient.update.mock.calls[0][2];
      // Mixing the new code with the old system would be incoherent: the
      // whole coding is rebuilt with the default НСИ system.
      expect(merged['type']).toEqual([
        { coding: [{ system: FHIR_BY.SERVICE_CODE_SYSTEM, code: '02' }] },
      ]);
      // ...while unrelated fields survive the partial merge.
      expect(merged['comment']).toBe('Existing description');
    });

    it('replaces the type coding with the explicitly supplied typeSystem', async () => {
      fhirClient.operation.mockResolvedValue(lookupFound);
      fhirClient.read.mockResolvedValue(existing);
      fhirClient.update.mockResolvedValue({ ...existing });

      await servicesService.update(serviceId, {
        typeSystem: 'https://fhir.by/CodeSystem/nsi-services',
        typeCode: '03',
      });

      const merged = fhirClient.update.mock.calls[0][2];
      expect(merged['type']).toEqual([
        {
          coding: [
            {
              system: 'https://fhir.by/CodeSystem/nsi-services',
              code: '03',
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
          .update(serviceId, { typeCode: '999' })
          .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect((error as Error).message).toContain('TERMINOLOGY_NOT_FOUND');
        expect(fhirClient.update).not.toHaveBeenCalled();
      },
    );

    it('does not disguise a HAPI outage as an unknown code', async () => {
      fhirClient.read.mockResolvedValue(existing);
      fhirClient.operation.mockRejectedValue(lookupFailure(503));

      const error = await servicesService
        .update(serviceId, { typeCode: '02' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(FhirClientError);
      expect((error as FhirClientError).getStatus()).toBe(502);
      expect(fhirClient.update).not.toHaveBeenCalled();
    });

    it('rejects a typeSystem-only PATCH instead of blanking the stored code', async () => {
      fhirClient.read.mockResolvedValue(existing);

      const error = await servicesService
        .update(serviceId, { typeSystem: FHIR_BY.SERVICE_CODE_SYSTEM })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(fhirClient.operation).not.toHaveBeenCalled();
      expect(fhirClient.update).not.toHaveBeenCalled();
    });

    it('keeps stored defaults when only the description changes', async () => {
      // Sanity: SERVICE_IN_USE belongs to remove(); ensure update stays open.
      fhirClient.operation.mockResolvedValue(lookupFound);
      fhirClient.read.mockResolvedValue(existing);
      fhirClient.update.mockResolvedValue(existing);

      await expect(
        servicesService.update(serviceId, { description: 'Updated' }),
      ).resolves.toMatchObject({ id: serviceId });
    });
  });

  describe('list', () => {
    const catalogBundle = { entry: [{ resource: { resourceType: 'HealthcareService', id: serviceId, name: 'Therapy' } }] };

    it('should cache the plain listing under one key per page when no search term is given', async () => {
      // Arrange
      const store = new InMemoryCacheStore();
      servicesService = new ServicesService(fhirClient, new RedisCacheService(store));
      fhirClient.search.mockResolvedValue(catalogBundle);

      // Act
      await servicesService.list(2, 20);
      await servicesService.list(2, 20);

      // Assert
      expect(fhirClient.search).toHaveBeenCalledTimes(1);
      expect([...store.entries.keys()]).toEqual([CACHE_KEYS.SERVICES_PAGE(2, 20)]);
    });

    it('should not cache anything when a search term is given', async () => {
      // Arrange — a key per free-text term would let an anonymous caller fill the shared Redis.
      const store = new InMemoryCacheStore();
      servicesService = new ServicesService(fhirClient, new RedisCacheService(store));
      fhirClient.search.mockResolvedValue(catalogBundle);

      // Act
      await servicesService.list(1, 20, 'терапевт');
      await servicesService.list(1, 20, 'терапевт');

      // Assert
      expect(fhirClient.search).toHaveBeenCalledTimes(2);
      expect(store.entries.size).toBe(0);
      expect(fhirClient.search).toHaveBeenCalledWith('HealthcareService', {
        name: 'терапевт',
        _count: 20,
        _offset: 0,
      });
    });

    it('should treat a blank search term as the plain listing when only whitespace is sent', async () => {
      // Arrange
      const store = new InMemoryCacheStore();
      servicesService = new ServicesService(fhirClient, new RedisCacheService(store));
      fhirClient.search.mockResolvedValue(catalogBundle);

      // Act
      await servicesService.list(1, 20, '   ');

      // Assert
      expect([...store.entries.keys()]).toEqual([CACHE_KEYS.SERVICES_PAGE(1, 20)]);
      expect(fhirClient.search).toHaveBeenCalledWith('HealthcareService', { _count: 20, _offset: 0 });
    });

    it('should clear every cached page when a service is created', async () => {
      // Arrange
      const store = new InMemoryCacheStore();
      servicesService = new ServicesService(fhirClient, new RedisCacheService(store));
      fhirClient.search.mockResolvedValue(catalogBundle);
      fhirClient.operation.mockResolvedValue(lookupFound);
      fhirClient.create.mockResolvedValue({ resourceType: 'HealthcareService', id: 'svc-2' });
      await servicesService.list(1, 20);
      await servicesService.list(2, 20);

      // Act
      await servicesService.create({
        name: 'New',
        typeSystem: FHIR_BY.SERVICE_CODE_SYSTEM,
        typeCode: '01',
        defaultDurationMin: 30,
      });

      // Assert
      expect(store.entries.size).toBe(0);
    });
  });

  describe('remove', () => {
    it('refuses to delete a service referenced by an active schedule', async () => {
      fhirClient.search.mockResolvedValue({ entry: [{ resource: { resourceType: 'Schedule' } }] });

      await expect(servicesService.remove(serviceId)).rejects.toThrow('SERVICE_IN_USE');
      await expect(servicesService.remove(serviceId)).rejects.toBeInstanceOf(ConflictException);
      expect(fhirClient.delete).not.toHaveBeenCalled();
    });

    it('should look up referencing schedules through Schedule.actor when the delete is checked', async () => {
      // Arrange
      fhirClient.search.mockResolvedValue({ entry: [] });

      // Act
      await servicesService.remove(serviceId);

      // Assert — R4 `Schedule` has no `service` search parameter (HAPI answers
      // 400 → 500 INTERNAL); the service is one of the schedule's actors.
      expect(fhirClient.search).toHaveBeenCalledWith('Schedule', {
        actor: `HealthcareService/${serviceId}`,
        _count: 1,
      });
      expect(fhirClient.delete).toHaveBeenCalledWith('HealthcareService', serviceId);
    });
  });
});
