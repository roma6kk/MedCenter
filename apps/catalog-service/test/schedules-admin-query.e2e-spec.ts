import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createValidationPipe } from '@medcenter/common';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';
import request from 'supertest';

import { AppModule } from '../src/app/app.module';
import { InMemoryCacheStore } from '../src/modules/cache/__tests__/in-memory-cache-store';
import { CACHE_STORE } from '../src/modules/cache/redis-cache.service';
import { applyE2eEnv } from './e2e-env';
import { bearer, DOCTOR_SCOPE } from '@medcenter/testing';

jest.mock('jose', () => jest.requireActual<typeof import('@medcenter/testing')>('@medcenter/testing').decodeOnlyJose());

describe('Admin schedule queries (e2e)', () => {
  let app: INestApplication;
  let fhir: jest.Mocked<FhirClient>;
  const admin = bearer({ role: 'ADMIN', scope: DOCTOR_SCOPE });

  beforeEach(async () => {
    applyE2eEnv();
    fhir = { search: jest.fn().mockResolvedValue({ entry: [] }), read: jest.fn().mockResolvedValue({ resourceType: 'Schedule', id: 'sched-1' }) } as unknown as jest.Mocked<FhirClient>;
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
    await request(app.getHttpServer())
      .get('/api/v1/admin/schedules?doctorId=role-7&active=true')
      .set('Authorization', admin)
      .expect(200);

    expect(fhir.search).toHaveBeenCalledWith('Schedule', {
      actor: 'PractitionerRole/role-7',
      active: 'true',
      _sort: '-_lastUpdated,_id',
      _count: 20,
      _offset: 0,
      _total: 'accurate',
    });
  });

  it('should answer the schedule list in the paginated envelope with ScheduleSummaryDto items when the admin lists schedules', async () => {
    fhir.search.mockResolvedValue({ total: 1, entry: [{ resource: { resourceType: 'Schedule', id: 's-1', active: true } }] });

    const response = await request(app.getHttpServer()).get('/api/v1/admin/schedules?page=1&pageSize=5').set('Authorization', admin).expect(200);

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
    const response = await request(app.getHttpServer())
      .get(`/api/v1/admin/schedules?${query}`)
      .set('Authorization', admin)
      .expect(400);

    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
    expect(fhir.search).not.toHaveBeenCalled();
  });

  it('should search the slots between the given bounds when the query is valid', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/schedules/sched-1/slots?from=2026-11-01&to=2026-11-30&status=free,busy')
      .set('Authorization', admin)
      .expect(200);

    expect(fhir.read).toHaveBeenCalledWith('Schedule', 'sched-1');
    expect(fhir.search).toHaveBeenCalledWith('Slot', {
      schedule: 'Schedule/sched-1',
      start: ['ge2026-10-31T21:00:00.000Z', 'le2026-11-30T20:59:59.999Z'],
      status: 'free,busy',
      _sort: 'start,_id',
      _count: 200,
      _offset: 0,
    });
  });

  it.each([
    ['no bounds', ''],
    ['a bound that is not a date', '?from=abc&to=2026-11-30'],
    ['a status outside the Slot value set', '?from=2026-11-01&to=2026-11-30&status=open'],
  ])('should answer 400 VALIDATION_ERROR before HAPI is called when the slot query has %s', async (_label, query) => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/admin/schedules/sched-1/slots${query}`)
      .set('Authorization', admin)
      .expect(400);

    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
    expect(fhir.search).not.toHaveBeenCalled();
  });
});
