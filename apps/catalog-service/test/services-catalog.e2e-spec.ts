import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createValidationPipe } from '@medcenter/common';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';
import request from 'supertest';

import { AppModule } from '../src/app/app.module';
import { InMemoryCacheStore } from '../src/modules/cache/__tests__/in-memory-cache-store';
import { CACHE_KEYS, CACHE_STORE } from '../src/modules/cache/redis-cache.service';
import { applyE2eEnv } from './e2e-env';
import { bearer, DOCTOR_SCOPE } from './e2e-tokens';

jest.mock('jose', () => jest.requireActual<typeof import('./e2e-tokens')>('./e2e-tokens').decodeOnlyJose());

/**
 * Public services listing (API §5.1.1) through the real validation pipe: the
 * query is unauthenticated input and feeds both HAPI paging and the cache key.
 */
describe('Services catalog (e2e)', () => {
  let app: INestApplication;
  let fhir: jest.Mocked<FhirClient>;
  let store: InMemoryCacheStore;

  beforeEach(async () => {
    applyE2eEnv();
    fhir = { search: jest.fn().mockResolvedValue({ entry: [] }), read: jest.fn() } as unknown as jest.Mocked<FhirClient>;
    store = new InMemoryCacheStore();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FHIR_CLIENT)
      .useValue(fhir)
      .overrideProvider(CACHE_STORE)
      .useValue(store)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('should answer the listing in the pagination envelope when the page is requested', async () => {
    // Arrange
    fhir.search.mockResolvedValue({
      total: 41,
      entry: [{ resource: { resourceType: 'HealthcareService', id: 'svc-1', name: 'Therapy', active: true } }],
    });

    // Act
    const response = await request(app.getHttpServer()).get('/api/v1/services?page=2&pageSize=20').expect(200);

    // Assert
    expect(Array.isArray(response.body)).toBe(false);
    expect(response.body.items).toEqual([expect.objectContaining({ id: 'svc-1', name: 'Therapy' })]);
    expect(response.body.meta).toEqual({ page: 2, pageSize: 20, totalItems: 41, totalPages: 3 });
    expect(fhir.search).toHaveBeenCalledWith('HealthcareService', { _count: 20, _offset: 20, _total: 'accurate' });
  });

  it('should answer a repeated listing from the cache when the page and size match', async () => {
    // Act
    await request(app.getHttpServer()).get('/api/v1/services?page=1&pageSize=20').expect(200);
    await request(app.getHttpServer()).get('/api/v1/services?page=1&pageSize=20').expect(200);

    // Assert
    expect(fhir.search).toHaveBeenCalledTimes(1);
    expect([...store.entries.keys()]).toEqual([CACHE_KEYS.SERVICES_PAGE(1, 20)]);
  });

  it('should keep a search out of the cache when the term is free text', async () => {
    // Act
    await request(app.getHttpServer()).get('/api/v1/services?search=therapy').expect(200);

    // Assert
    expect(fhir.search).toHaveBeenCalledWith('HealthcareService', {
      name: 'therapy',
      _count: 20,
      _offset: 0,
      _total: 'accurate',
    });
    expect(store.entries.size).toBe(0);
  });

  it.each([
    ['a non-numeric page', 'page=abc'],
    ['page 0', 'page=0'],
    ['a pageSize above 100', 'pageSize=101'],
    ['a search longer than 100 characters', `search=${'x'.repeat(101)}`],
  ])('should reject the call with 400 VALIDATION_ERROR before HAPI is called when the query has %s', async (_label, query) => {
    // Act
    const response = await request(app.getHttpServer()).get(`/api/v1/services?${query}`).expect(400);

    // Assert
    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
    expect(fhir.search).not.toHaveBeenCalled();
    expect(store.entries.size).toBe(0);
  });

  it('should reject the call with 400 VALIDATION_ERROR when the service id is not a FHIR id', async () => {
    // Act
    const response = await request(app.getHttpServer()).get('/api/v1/services/a,b').expect(400);

    // Assert
    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
    expect(fhir.read).not.toHaveBeenCalled();
  });

  it('should reject the call with 400 VALIDATION_ERROR when an admin deletes a schedule with an id that is not a FHIR id', async () => {
    // Arrange
    const admin = bearer({ role: 'ADMIN', scope: DOCTOR_SCOPE });

    // Act
    const response = await request(app.getHttpServer())
      .delete('/api/v1/admin/schedules/a,b')
      .set('Authorization', admin)
      .send({})
      .expect(400);

    // Assert
    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
    expect(fhir.search).not.toHaveBeenCalled();
  });
});
