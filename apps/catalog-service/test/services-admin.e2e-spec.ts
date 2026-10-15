import { FhirClientError, type FhirResource } from '@medcenter/fhir';
import { FHIR_BY, MEDCENTER_EXT } from '@medcenter/terminology';
import request from 'supertest';

import { CACHE_KEYS } from '../src/modules/cache/redis-cache.service';
import { bootCatalog, TOKENS, type CatalogHarness } from './catalog-harness';

jest.mock('jose', () => jest.requireActual<typeof import('./e2e-tokens')>('./e2e-tokens').decodeOnlyJose());

const SERVICES = '/api/v1/admin/services';
const SERVICE_PAGE_KEY = CACHE_KEYS.SERVICES_PAGE(1, 20);
const SLOT_KEY = CACHE_KEYS.DOCTOR_SLOTS_DAY('doc-1', '2026-11-02');
const VALID_BODY = {
  name: 'Приём терапевта',
  typeSystem: FHIR_BY.SERVICE_CODE_SYSTEM,
  typeCode: 'A01.001',
  defaultDurationMin: 30,
  description: 'Первичный приём',
};

function storedService(overrides: Record<string, unknown> = {}): FhirResource {
  return {
    resourceType: 'HealthcareService',
    id: 'svc-1',
    active: true,
    name: 'Приём терапевта',
    comment: 'Первичный приём',
    type: [{ coding: [{ system: FHIR_BY.SERVICE_CODE_SYSTEM, code: 'A01.001', display: 'Приём' }] }],
    extension: [{ url: MEDCENTER_EXT.SERVICE_DEFAULT_DURATION, valueInteger: 30 }],
    ...overrides,
  };
}

function upstream(status: number | undefined): FhirClientError {
  return new FhirClientError('GET', 'http://hapi:8080/fhir/CodeSystem/$lookup', status, 'HAPI-9999 detail');
}

/**
 * Admin service writes (API §5.1.3 create, §5.1.4 update, §5.1.5 delete) through
 * the real guard stack, validation pipe and problem filter, with the terminology
 * lookup, the HAPI interactions and the cache invalidation all observable.
 */
describe('Services admin writes (e2e)', () => {
  let harness: CatalogHarness;

  beforeEach(async () => {
    harness = await bootCatalog();
    harness.fhir.operation.mockResolvedValue({ resourceType: 'Parameters' });
    harness.fhir.create.mockImplementation(async (_type, resource) => ({ ...resource, id: 'svc-new' }));
    harness.fhir.update.mockImplementation(async (_type, id, resource) => ({ ...resource, id }));
    harness.store.entries.set(SERVICE_PAGE_KEY, '{"items":[]}');
    harness.store.entries.set(SLOT_KEY, '[]');
  });

  afterEach(async () => {
    await harness.app?.close();
  });

  describe('POST /api/v1/admin/services', () => {
    function post(body: unknown, token: string = TOKENS.admin): request.Test {
      return request(harness.app.getHttpServer()).post(SERVICES).set('Authorization', token).send(body as object);
    }

    it('should verify the code, create the HealthcareService and answer 201 when an admin posts a valid body', async () => {
      // Act
      const response = await post(VALID_BODY).expect(201);

      // Assert
      expect(harness.fhir.operation).toHaveBeenCalledWith('CodeSystem', '$lookup', {
        system: FHIR_BY.SERVICE_CODE_SYSTEM,
        code: 'A01.001',
      });
      expect(harness.fhir.create).toHaveBeenCalledWith('HealthcareService', {
        resourceType: 'HealthcareService',
        name: 'Приём терапевта',
        comment: 'Первичный приём',
        extension: [{ url: MEDCENTER_EXT.SERVICE_DEFAULT_DURATION, valueInteger: 30 }],
        type: [{ coding: [{ system: FHIR_BY.SERVICE_CODE_SYSTEM, code: 'A01.001' }] }],
      });
      expect(response.body).toMatchObject({ id: 'svc-new', name: 'Приём терапевта', typeCode: 'A01.001', defaultDurationMin: 30, isActive: true });
    });

    it('should clear the cached listing and leave unrelated cache entries when a service is created', async () => {
      // Act
      await post(VALID_BODY).expect(201);

      // Assert
      expect(harness.store.entries.has(SERVICE_PAGE_KEY)).toBe(false);
      expect(harness.store.entries.has(SLOT_KEY)).toBe(true);
    });

    it('should answer 422 TERMINOLOGY_NOT_FOUND and create nothing when HAPI does not know the code', async () => {
      // Arrange
      harness.fhir.operation.mockRejectedValue(upstream(404));

      // Act
      const response = await post(VALID_BODY).expect(422);

      // Assert
      expect(response.body).toMatchObject({ status: 422, errorCode: 'TERMINOLOGY_NOT_FOUND' });
      expect(harness.fhir.create).not.toHaveBeenCalled();
      expect(harness.store.entries.has(SERVICE_PAGE_KEY)).toBe(true);
    });

    it('should answer 422 TERMINOLOGY_NOT_FOUND before the lookup when the code system is not the НСИ services system', async () => {
      // Act
      const response = await post({ ...VALID_BODY, typeSystem: 'http://snomed.info/sct' }).expect(422);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'TERMINOLOGY_NOT_FOUND' });
      expect(harness.fhir.operation).not.toHaveBeenCalled();
      expect(harness.fhir.create).not.toHaveBeenCalled();
    });

    it('should answer 502 INTERNAL without the HAPI detail and create nothing when the lookup itself fails', async () => {
      // Arrange
      harness.fhir.operation.mockRejectedValue(upstream(503));

      // Act
      const response = await post(VALID_BODY).expect(502);

      // Assert
      expect(response.body).toMatchObject({ status: 502, errorCode: 'INTERNAL' });
      expect(JSON.stringify(response.body)).not.toMatch(/HAPI-9999|hapi:8080/);
      expect(harness.fhir.create).not.toHaveBeenCalled();
    });

    it.each([
      ['no name', { ...VALID_BODY, name: undefined }],
      ['a name above 200 characters', { ...VALID_BODY, name: 'x'.repeat(201) }],
      ['no typeCode', { ...VALID_BODY, typeCode: undefined }],
      ['an empty typeSystem', { ...VALID_BODY, typeSystem: '' }],
      ['a duration of 4 minutes', { ...VALID_BODY, defaultDurationMin: 4 }],
      ['a duration of 241 minutes', { ...VALID_BODY, defaultDurationMin: 241 }],
      ['a duration sent as text', { ...VALID_BODY, defaultDurationMin: 'half an hour' }],
      ['a description above 2000 characters', { ...VALID_BODY, description: 'x'.repeat(2001) }],
      ['specialtyCodes that are not strings', { ...VALID_BODY, specialtyCodes: [1, 2] }],
    ])('should answer 400 VALIDATION_ERROR before the lookup when the body has %s', async (_label, body) => {
      // Act
      const response = await post(body).expect(400);

      // Assert
      expect(response.body).toMatchObject({ status: 400, errorCode: 'VALIDATION_ERROR' });
      expect(harness.fhir.operation).not.toHaveBeenCalled();
      expect(harness.fhir.create).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /api/v1/admin/services/{id}', () => {
    beforeEach(() => {
      harness.fhir.read.mockResolvedValue(storedService());
    });

    function patch(body: object, id = 'svc-1'): request.Test {
      return request(harness.app.getHttpServer()).patch(`${SERVICES}/${id}`).set('Authorization', TOKENS.admin).send(body);
    }

    it('should merge only the patched name and clear the cached listing when an admin renames the service', async () => {
      // Act
      const response = await patch({ name: 'Приём терапевта (повторный)' }).expect(200);

      // Assert
      expect(harness.fhir.operation).not.toHaveBeenCalled();
      const [type, id, merged] = harness.fhir.update.mock.calls[0] ?? [];
      expect([type, id]).toEqual(['HealthcareService', 'svc-1']);
      expect(merged).toMatchObject({ name: 'Приём терапевта (повторный)', comment: 'Первичный приём' });
      expect(merged?.['type']).toEqual(storedService()['type']);
      expect(response.body).toMatchObject({ id: 'svc-1', name: 'Приём терапевта (повторный)', typeCode: 'A01.001' });
      expect(harness.store.entries.has(SERVICE_PAGE_KEY)).toBe(false);
    });

    it('should verify the new code and replace the whole type coding when the typeCode is patched', async () => {
      // Act
      await patch({ typeCode: 'A01.002' }).expect(200);

      // Assert
      expect(harness.fhir.operation).toHaveBeenCalledWith('CodeSystem', '$lookup', {
        system: FHIR_BY.SERVICE_CODE_SYSTEM,
        code: 'A01.002',
      });
      const [, , merged] = harness.fhir.update.mock.calls[0] ?? [];
      expect(merged?.['type']).toEqual([{ coding: [{ system: FHIR_BY.SERVICE_CODE_SYSTEM, code: 'A01.002' }] }]);
    });

    it('should answer 400 VALIDATION_ERROR and touch nothing when typeSystem is patched without a typeCode', async () => {
      // Act
      const response = await patch({ typeSystem: FHIR_BY.SERVICE_CODE_SYSTEM }).expect(400);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
      expect(harness.fhir.read).not.toHaveBeenCalled();
      expect(harness.fhir.update).not.toHaveBeenCalled();
    });

    it.each([
      ['an empty name', { name: '' }],
      ['a duration of 241 minutes', { defaultDurationMin: 241 }],
      ['a typeCode above 50 characters', { typeCode: 'x'.repeat(51) }],
    ])('should answer 400 VALIDATION_ERROR before HAPI is called when the patch has %s', async (_label, body) => {
      // Act
      const response = await patch(body).expect(400);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
      expect(harness.fhir.read).not.toHaveBeenCalled();
    });

    it('should answer 422 TERMINOLOGY_NOT_FOUND and write nothing when the patched code is unknown', async () => {
      // Arrange
      harness.fhir.operation.mockRejectedValue(upstream(422));

      // Act
      const response = await patch({ typeCode: 'ZZZ' }).expect(422);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'TERMINOLOGY_NOT_FOUND' });
      expect(harness.fhir.update).not.toHaveBeenCalled();
    });

    it('should answer 404 NOT_FOUND and keep the cache when the service does not exist', async () => {
      // Arrange
      harness.fhir.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi:8080/fhir/HealthcareService/ghost', 404, '{}'));

      // Act
      const response = await patch({ name: 'Новое имя' }, 'ghost').expect(404);

      // Assert
      expect(response.body).toMatchObject({ status: 404, errorCode: 'NOT_FOUND' });
      expect(harness.store.entries.has(SERVICE_PAGE_KEY)).toBe(true);
    });
  });
});
