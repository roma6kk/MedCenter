import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createValidationPipe } from '@medcenter/common';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';
import request from 'supertest';

import { AppModule } from '../src/app/app.module';
import { applyE2eEnv } from './e2e-env';
import { ADMIN_SCOPE, bearer } from '@medcenter/testing';

jest.mock('jose', () => jest.requireActual<typeof import('@medcenter/testing')>('@medcenter/testing').decodeOnlyJose());

describe('Rooms and doctors queries (e2e)', () => {
  const admin = bearer({ role: 'ADMIN', scope: ADMIN_SCOPE });
  let app: INestApplication;
  let fhir: jest.Mocked<FhirClient>;

  beforeEach(async () => {
    applyE2eEnv();
    fhir = { search: jest.fn().mockResolvedValue({ entry: [] }), read: jest.fn() } as unknown as jest.Mocked<FhirClient>;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FHIR_CLIENT)
      .useValue(fhir)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('should answer the requested room page without a physical-type search when page and pageSize are valid', async () => {
    const room = (id: string): object => ({
      resource: {
        resourceType: 'Location',
        id,
        name: id,
        physicalType: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/location-physical-type', code: 'ro' }] },
      },
    });
    const building = { resource: { resourceType: 'Location', id: 'wing', physicalType: { coding: [{ code: 'wi' }] } } };
    fhir.search.mockResolvedValue({
      entry: [building, ...Array.from({ length: 25 }, (_, index) => room(`r${index + 1}`)), building],
    } as never);

    const response = await request(app.getHttpServer()).get('/api/v1/rooms?page=3&pageSize=10').set('Authorization', admin).expect(200);

    const body = response.body as { items: { id: string }[]; meta: unknown };
    expect(fhir.search).toHaveBeenCalledWith('Location', { _count: 100, _offset: 0 });
    expect(body.items.map((item) => item.id)).toEqual(['r21', 'r22', 'r23', 'r24', 'r25']);
    expect(body.meta).toEqual({ page: 3, pageSize: 10, totalItems: 25, totalPages: 3 });
  });

  it('should use the default page when the room query is empty', async () => {
    await request(app.getHttpServer()).get('/api/v1/rooms').set('Authorization', admin).expect(200);

    expect(fhir.search).toHaveBeenCalledWith('Location', { _count: 100, _offset: 0 });
  });

  it.each([
    ['page=abc', 'page=abc'],
    ['pageSize=0', 'pageSize=0'],
    ['pageSize=101', 'pageSize=101'],
  ])('should answer 400 VALIDATION_ERROR before HAPI is called when the room list has %s', async (_label, query) => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/rooms?${query}`)
      .set('Authorization', admin)
      .expect(400);

    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
    expect(fhir.search).not.toHaveBeenCalled();
  });

  it('should list doctors without a token when the query is valid; the name is matched by the service over a scan of the practitioners', async () => {
    await request(app.getHttpServer()).get('/api/v1/doctors?page=2&pageSize=5&search=Ivanov').expect(200);

    expect(fhir.search).toHaveBeenCalledWith('Practitioner', { 'active:not': 'false', _count: 100, _offset: 0 });
  });

  it('should answer the doctor list in the section 0 envelope with the display name when HAPI returns practitioners', async () => {
    fhir.search.mockResolvedValue({
      total: 3,
      entry: [{ resource: { resourceType: 'Practitioner', id: 'p1', name: [{ family: 'Иванова', given: ['Мария'] }] } }],
    } as never);

    const response = await request(app.getHttpServer()).get('/api/v1/doctors?page=1&pageSize=2').expect(200);

    expect(response.body).toEqual({
      items: [{ id: 'p1', name: 'Мария Иванова', firstName: 'Мария', lastName: 'Иванова', practitionerRoleIds: [] }],
      meta: { page: 1, pageSize: 2, totalItems: 3, totalPages: 2 },
    });
  });

  it('should scan the active PractitionerRoles by ids only when the doctor list has a specialty and a service', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/doctors?specialty=419192003&serviceId=svc-1&search=Ivanov&page=2&pageSize=5')
      .expect(200);

    expect(fhir.search).toHaveBeenCalledWith('PractitionerRole', {
      service: 'HealthcareService/svc-1',
      specialty: '419192003',
      'active:not': 'false',
      _elements: 'practitioner',
      _count: 1000,
    });
  });

  it.each([
    ['page=abc', 'page=abc'],
    ['pageSize=1000', 'pageSize=1000'],
    ['a comma-separated serviceId', 'serviceId=a,b'],
    ['a search above 100 characters', `search=${'x'.repeat(101)}`],
  ])('should answer 400 VALIDATION_ERROR on the public catalog before HAPI is called when the query has %s', async (_label, query) => {
    const response = await request(app.getHttpServer()).get(`/api/v1/doctors?${query}`).expect(400);

    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
    expect(fhir.search).not.toHaveBeenCalled();
  });

  it('should answer 400 VALIDATION_ERROR before HAPI is called when the doctor id is not a FHIR id', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/doctors/a,b').expect(400);

    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
    expect(fhir.read).not.toHaveBeenCalled();
  });
});
