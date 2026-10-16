import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createValidationPipe } from '@medcenter/common';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';
import request from 'supertest';

import { AppModule } from '../src/app/app.module';
import { InMemoryCacheStore } from '../src/modules/cache/__tests__/in-memory-cache-store';
import { CACHE_STORE } from '../src/modules/cache/redis-cache.service';
import { applyE2eEnv } from './e2e-env';
import { bearer, DOCTOR_SCOPE } from './e2e-tokens';

jest.mock('jose', () => jest.requireActual<typeof import('./e2e-tokens')>('./e2e-tokens').decodeOnlyJose());

/**
 * Admin schedule reads (API §5.2.2, §5.2.6) through the real validation pipe:
 * the query is the only free text on these routes and it feeds HAPI searches
 * and, for slots, the cache key.
 */
describe('Admin schedule queries (e2e)', () => {
  let app: INestApplication;
  let fhir: jest.Mocked<FhirClient>;
  const admin = bearer({ role: 'ADMIN', scope: DOCTOR_SCOPE });

  beforeEach(async () => {
    applyE2eEnv();
    fhir = { search: jest.fn().mockResolvedValue({ entry: [] }), read: jest.fn() } as unknown as jest.Mocked<FhirClient>;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FHIR_CLIENT)
      .useValue(fhir)
      .overrideProvider(CACHE_STORE)
      .useValue(new InMemoryCacheStore())
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('should search the schedules of one role when the doctorId is a FHIR id', async () => {
    // Act
    await request(app.getHttpServer())
      .get('/api/v1/admin/schedules?doctorId=role-7&active=true')
      .set('Authorization', admin)
      .expect(200);

    // Assert
    expect(fhir.search).toHaveBeenCalledWith('Schedule', {
      actor: 'PractitionerRole/role-7',
      active: 'true',
      _sort: '_id',
      _count: 20,
      _offset: 0,
      _total: 'accurate',
    });
  });

  it('should answer the schedule list in the paginated envelope with ScheduleSummaryDto items when the admin lists schedules', async () => {
    // Arrange
    fhir.search.mockResolvedValue({ total: 1, entry: [{ resource: { resourceType: 'Schedule', id: 's-1', active: true } }] });

    // Act
    const response = await request(app.getHttpServer()).get('/api/v1/admin/schedules?page=1&pageSize=5').set('Authorization', admin).expect(200);

    // Assert
    expect(response.body).toEqual({
      items: [{ id: 's-1', isActive: true, windows: [] }],
      meta: { page: 1, pageSize: 5, totalItems: 1, totalPages: 1 },
    });
  });

  it.each([
    ['a comma-separated doctorId', 'doctorId=role-1,role-2'],
    ['an active flag that is not a boolean', 'active=maybe'],
    ['a page below 1', 'page=0'],
    ['a pageSize above 100', 'pageSize=101'],
  ])('should answer 400 VALIDATION_ERROR before HAPI is called when the schedule list has %s', async (_label, query) => {
    // Act
    const response = await request(app.getHttpServer())
      .get(`/api/v1/admin/schedules?${query}`)
      .set('Authorization', admin)
      .expect(400);

    // Assert — a comma would have become an OR over other practitioners' roles.
    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
    expect(fhir.search).not.toHaveBeenCalled();
  });

  it('should search the slots between the given bounds when the query is valid', async () => {
    // Act
    await request(app.getHttpServer())
      .get('/api/v1/admin/schedules/sched-1/slots?from=2026-11-01&to=2026-11-30&status=free,busy')
      .set('Authorization', admin)
      .expect(200);

    // Assert
    expect(fhir.search).toHaveBeenCalledWith('Slot', {
      schedule: 'Schedule/sched-1',
      start: ['ge2026-11-01', 'le2026-11-30'],
      status: 'free,busy',
    });
  });

  it.each([
    ['no bounds', ''],
    ['a bound that is not a date', '?from=abc&to=2026-11-30'],
    ['a status outside the Slot value set', '?from=2026-11-01&to=2026-11-30&status=open'],
  ])('should answer 400 VALIDATION_ERROR before HAPI is called when the slot query has %s', async (_label, query) => {
    // Act
    const response = await request(app.getHttpServer())
      .get(`/api/v1/admin/schedules/sched-1/slots${query}`)
      .set('Authorization', admin)
      .expect(400);

    // Assert
    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
    expect(fhir.search).not.toHaveBeenCalled();
  });
});
