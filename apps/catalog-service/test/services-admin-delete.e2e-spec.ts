import { FhirClientError } from '@medcenter/fhir';
import request from 'supertest';

import { CACHE_KEYS } from '../src/modules/cache/redis-cache.service';
import { auditedResource, committedAudit, committedEntries, transactionResponder } from '../src/common/__tests__/audited-transactions';
import { bootCatalog, TOKENS, type CatalogHarness } from './catalog-harness';

jest.mock('jose', () => jest.requireActual<typeof import('./e2e-tokens')>('./e2e-tokens').decodeOnlyJose());

const SERVICES = '/api/v1/admin/services';
const SERVICE_URL = `${SERVICES}/svc-1`;
const SERVICE_PAGE_KEY = CACHE_KEYS.SERVICES_PAGE(1, 20);

type Verb = 'post' | 'patch' | 'delete';

const ADMIN_WRITES: ReadonlyArray<{ readonly label: string; readonly verb: Verb; readonly path: string; readonly body?: object }> = [
  {
    label: 'POST /admin/services',
    verb: 'post',
    path: SERVICES,
    body: { name: 'Приём', typeSystem: 'https://fhir.by/CodeSystem/nsi-services', typeCode: 'A01.001', defaultDurationMin: 30 },
  },
  { label: 'PATCH /admin/services/{id}', verb: 'patch', path: SERVICE_URL, body: { name: 'Приём' } },
  { label: 'DELETE /admin/services/{id}', verb: 'delete', path: SERVICE_URL },
];

/**
 * Admin service delete (API §5.1.5) and who may call the admin writes (BR-007).
 * `SERVICE_IN_USE` is the catalogued conflict code the client sees when a
 * schedule still references the service.
 */
describe('Services admin delete and access (e2e)', () => {
  let harness: CatalogHarness;

  beforeEach(async () => {
    harness = await bootCatalog();
    harness.fhir.read.mockResolvedValue({ resourceType: 'HealthcareService', id: 'svc-1' });
    harness.fhir.batch.mockImplementation(transactionResponder());
    harness.store.entries.set(SERVICE_PAGE_KEY, '{"items":[]}');
  });

  afterEach(async () => {
    await harness.app?.close();
  });

  describe('DELETE /api/v1/admin/services/{id}', () => {
    function remove(id = 'svc-1'): request.Test {
      return request(harness.app.getHttpServer()).delete(`${SERVICES}/${id}`).set('Authorization', TOKENS.admin);
    }

    it('should look for referencing schedules, delete the HealthcareService and clear the cache when none exists', async () => {
      // Act
      await remove().expect(204);

      // Assert
      expect(harness.fhir.search).toHaveBeenCalledWith('Schedule', { actor: 'HealthcareService/svc-1', _count: 1 });
      expect(committedEntries(harness.fhir).map((entry) => `${entry.request.method} ${entry.request.url}`)).toEqual(['DELETE HealthcareService/svc-1', 'POST AuditEvent']);
      expect(committedAudit(harness.fhir)).toMatchObject({ action: 'D', entity: [auditedResource('HealthcareService', 'svc-1'), expect.anything()] });
      expect(harness.store.entries.has(SERVICE_PAGE_KEY)).toBe(false);
    });

    it('should answer 409 SERVICE_IN_USE as problem+json and delete nothing when a schedule references the service', async () => {
      // Arrange
      harness.fhir.search.mockResolvedValue({ entry: [{ resource: { resourceType: 'Schedule', id: 'sched-1' } }] });

      // Act
      const response = await remove().expect(409);

      // Assert — the catalogued code reaches the client instead of the generic CONFLICT.
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({
        status: 409,
        errorCode: 'SERVICE_IN_USE',
        type: 'https://api.medcenter.by/errors/service-in-use',
        instance: SERVICE_URL,
      });
      expect(response.body.detail).toContain('SERVICE_IN_USE');
      expect(harness.fhir.batch).not.toHaveBeenCalled();
      expect(harness.store.entries.has(SERVICE_PAGE_KEY)).toBe(true);
    });

    it('should answer 404 NOT_FOUND and keep the cache when HAPI has no such service to delete', async () => {
      // Arrange
      harness.fhir.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi:8080/fhir/HealthcareService/svc-1', 404, '{}'));

      // Act
      const response = await remove().expect(404);

      // Assert
      expect(response.body).toMatchObject({ status: 404, errorCode: 'NOT_FOUND' });
      expect(harness.store.entries.has(SERVICE_PAGE_KEY)).toBe(true);
    });

    it('should answer 409 CONFLICT when HAPI itself refuses the delete on referential integrity', async () => {
      // Arrange — a schedule created between the check and the delete: HAPI's own 409.
      harness.fhir.batch.mockRejectedValue(new FhirClientError('POST', 'http://hapi:8080/fhir', 409, '{}'));

      // Act
      const response = await remove().expect(409);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'CONFLICT' });
    });

    it('should answer 400 VALIDATION_ERROR before HAPI is called when the id is not a FHIR id', async () => {
      // Act
      const response = await remove('a,b').expect(400);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
      expect(harness.fhir.search).not.toHaveBeenCalled();
      expect(harness.fhir.batch).not.toHaveBeenCalled();
    });
  });

  describe.each(ADMIN_WRITES)('$label', ({ verb, path, body }) => {
    function call(token?: string): request.Test {
      const agent = request(harness.app.getHttpServer())[verb](path);
      const authorized = token === undefined ? agent : agent.set('Authorization', token);
      return body === undefined ? authorized : authorized.send(body);
    }

    function expectFhirUntouched(): void {
      for (const interaction of [harness.fhir.read, harness.fhir.search, harness.fhir.create, harness.fhir.update, harness.fhir.delete, harness.fhir.batch, harness.fhir.operation]) {
        expect(interaction).not.toHaveBeenCalled();
      }
    }

    it('should answer 401 UNAUTHENTICATED when the call carries no token', async () => {
      // Act
      const response = await call().expect(401);

      // Assert
      expect(response.body).toMatchObject({ status: 401, errorCode: 'UNAUTHENTICATED' });
      expectFhirUntouched();
    });

    it.each([
      ['doctor', TOKENS.doctor],
      ['patient', TOKENS.patient],
    ])('should answer 403 FORBIDDEN_ROLE and leave the cache alone when a %s calls it', async (_role, token) => {
      // Act
      const response = await call(token).expect(403);

      // Assert
      expect(response.body).toMatchObject({ status: 403, errorCode: 'FORBIDDEN_ROLE' });
      expectFhirUntouched();
      expect(harness.store.entries.has(SERVICE_PAGE_KEY)).toBe(true);
    });
  });
});
