import { FhirClientError } from '@medcenter/fhir';
import { FHIR_BY, MEDCENTER_EXT } from '@medcenter/terminology';
import request from 'supertest';

import { CACHE_KEYS } from '../src/modules/cache/redis-cache.service';
import { bootCatalog, TOKENS, type CatalogHarness } from './catalog-harness';

jest.mock('jose', () => jest.requireActual<typeof import('./e2e-tokens')>('./e2e-tokens').decodeOnlyJose());

const SERVICES = '/api/v1/services';

function healthcareService(id: string, name: string): { readonly resource: Record<string, unknown> & { readonly resourceType: string } } {
  return {
    resource: {
      resourceType: 'HealthcareService',
      id,
      name,
      type: [{ coding: [{ system: FHIR_BY.SERVICE_CODE_SYSTEM, code: 'A01.001', display: 'Приём' }] }],
      extension: [{ url: MEDCENTER_EXT.SERVICE_DEFAULT_DURATION, valueInteger: 30 }],
    },
  };
}

/**
 * Public service catalog (API §5.1.1, §5.1.2): the pagination envelope under
 * different HAPI answers, and how a failing HAPI is reported without poisoning
 * the cache.
 */
describe('Services public reads (e2e)', () => {
  let harness: CatalogHarness;

  beforeEach(async () => {
    harness = await bootCatalog();
  });

  afterEach(async () => {
    await harness.app?.close();
  });

  describe('GET /api/v1/services', () => {
    it('should count up to the current page when HAPI reports no total', async () => {
      // Arrange
      harness.fhir.search.mockResolvedValue({ entry: [healthcareService('svc-1', 'Терапевт'), healthcareService('svc-2', 'Хирург')] });

      // Act
      const response = await request(harness.app.getHttpServer()).get(`${SERVICES}?page=3&pageSize=2`).expect(200);

      // Assert
      expect(response.body.meta).toEqual({ page: 3, pageSize: 2, totalItems: 6, totalPages: 3 });
      expect(harness.fhir.search).toHaveBeenCalledWith('HealthcareService', { _count: 2, _offset: 4, _total: 'accurate' });
    });

    it('should map every HealthcareService to the service view when HAPI returns a page', async () => {
      // Arrange
      harness.fhir.search.mockResolvedValue({ total: 1, entry: [healthcareService('svc-1', 'Терапевт')] });

      // Act
      const response = await request(harness.app.getHttpServer()).get(SERVICES).expect(200);

      // Assert
      expect(response.body.items).toEqual([
        { id: 'svc-1', name: 'Терапевт', typeSystem: FHIR_BY.SERVICE_CODE_SYSTEM, typeCode: 'A01.001', typeDisplay: 'Приём', defaultDurationMin: 30, isActive: true },
      ]);
    });

    it('should answer 200 when a patient token is attached to the public route', async () => {
      // Act
      await request(harness.app.getHttpServer()).get(SERVICES).set('Authorization', TOKENS.patient).expect(200);

      // Assert
      expect(harness.fhir.search).toHaveBeenCalledTimes(1);
    });

    it('should answer 502 INTERNAL and cache nothing when HAPI is down', async () => {
      // Arrange
      harness.fhir.search.mockRejectedValue(new FhirClientError('GET', 'http://hapi:8080/fhir/HealthcareService', 503, 'HAPI-0001 detail'));

      // Act
      const response = await request(harness.app.getHttpServer()).get(SERVICES).expect(502);

      // Assert
      expect(response.body).toMatchObject({ status: 502, errorCode: 'INTERNAL' });
      expect(JSON.stringify(response.body)).not.toMatch(/HAPI-0001|hapi:8080/);
      expect(harness.store.entries.has(CACHE_KEYS.SERVICES_PAGE(1, 20))).toBe(false);
    });

    it('should serve the next call from HAPI again when the previous one failed', async () => {
      // Arrange
      harness.fhir.search
        .mockRejectedValueOnce(new FhirClientError('GET', 'http://hapi:8080/fhir/HealthcareService', 503, '{}'))
        .mockResolvedValueOnce({ total: 1, entry: [healthcareService('svc-1', 'Терапевт')] });
      await request(harness.app.getHttpServer()).get(SERVICES).expect(502);

      // Act
      const response = await request(harness.app.getHttpServer()).get(SERVICES).expect(200);

      // Assert
      expect(response.body.items).toHaveLength(1);
      expect(harness.fhir.search).toHaveBeenCalledTimes(2);
    });
  });

  describe('GET /api/v1/services/{id}', () => {
    it('should answer the service view when no token is sent', async () => {
      // Arrange
      harness.fhir.read.mockResolvedValue(healthcareService('svc-1', 'Терапевт').resource as never);

      // Act
      const response = await request(harness.app.getHttpServer()).get(`${SERVICES}/svc-1`).expect(200);

      // Assert
      expect(harness.fhir.read).toHaveBeenCalledWith('HealthcareService', 'svc-1');
      expect(response.body).toMatchObject({ id: 'svc-1', name: 'Терапевт', typeCode: 'A01.001', defaultDurationMin: 30 });
    });

    it('should answer 404 NOT_FOUND as problem+json when the service does not exist', async () => {
      // Arrange
      harness.fhir.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi:8080/fhir/HealthcareService/ghost', 404, '{}'));

      // Act
      const response = await request(harness.app.getHttpServer()).get(`${SERVICES}/ghost`).expect(404);

      // Assert
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ status: 404, errorCode: 'NOT_FOUND', instance: `${SERVICES}/ghost` });
    });
  });
});
