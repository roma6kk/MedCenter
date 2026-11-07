import { FhirClientError } from '@medcenter/fhir';
import { FHIR_BY } from '@medcenter/terminology';
import request from 'supertest';

import { bootCatalog, TOKENS, type CatalogHarness } from './catalog-harness';

jest.mock('jose', () => jest.requireActual<typeof import('@medcenter/testing')>('@medcenter/testing').decodeOnlyJose());

const ADMIN_SERVICES = '/api/v1/admin/services';

function stored(id: string, extra: Record<string, unknown> = {}): { readonly resource: Record<string, unknown> & { readonly resourceType: string } } {
  return {
    resource: {
      resourceType: 'HealthcareService',
      id,
      name: `Услуга ${id}`,
      type: [{ coding: [{ system: FHIR_BY.SERVICE_CODE_SYSTEM, code: 'A01.001' }] }],
      ...extra,
    },
  };
}

describe('Services deactivation (e2e)', () => {
  let harness: CatalogHarness;

  beforeEach(async () => {
    harness = await bootCatalog();
  });

  afterEach(async () => {
    await harness.app?.close();
  });

  describe('GET /api/v1/admin/services', () => {
    it('should list the deactivated services too when an admin asks', async () => {
      harness.fhir.search.mockResolvedValue({ total: 2, entry: [stored('a'), stored('b', { active: false })] });

      const response = await request(harness.app.getHttpServer()).get(ADMIN_SERVICES).set('Authorization', TOKENS.admin).expect(200);

      expect(harness.fhir.search).toHaveBeenCalledWith('HealthcareService', { _count: 20, _offset: 0, _total: 'accurate' });
      expect(response.body.items.map((item: { id: string; isActive: boolean }) => [item.id, item.isActive])).toEqual([['a', true], ['b', false]]);
      expect(response.body.meta.totalItems).toBe(2);
    });

    it.each([
      ['a patient', TOKENS.patient],
      ['a doctor', TOKENS.doctor],
    ])('should answer 403 FORBIDDEN_ROLE for %s', async (_label, token) => {
      await request(harness.app.getHttpServer()).get(ADMIN_SERVICES).set('Authorization', token).expect(403);
    });

    it('should answer 401 without a token', async () => {
      await request(harness.app.getHttpServer()).get(ADMIN_SERVICES).expect(401);
    });
  });

  describe('GET /api/v1/services/{id}', () => {
    it('should answer 404 NOT_FOUND for a deactivated service', async () => {
      harness.fhir.read.mockResolvedValue(stored('b', { active: false }).resource as never);

      const response = await request(harness.app.getHttpServer()).get('/api/v1/services/b').expect(404);

      expect(response.body).toMatchObject({ status: 404, errorCode: 'NOT_FOUND' });
    });

    it('should still answer the card of an active service', async () => {
      harness.fhir.read.mockResolvedValue(stored('a', { active: true }).resource as never);

      await request(harness.app.getHttpServer()).get('/api/v1/services/a').expect(200);
    });
  });

  describe('PATCH /api/v1/admin/services/{id}', () => {
    it('should answer 400 when isActive is not a boolean', async () => {
      harness.fhir.read.mockRejectedValue(new FhirClientError('GET', 'x', 404, '{}'));

      await request(harness.app.getHttpServer())
        .patch(`${ADMIN_SERVICES}/a`)
        .set('Authorization', TOKENS.admin)
        .send({ isActive: 'no' })
        .expect(400);
    });
  });
});
