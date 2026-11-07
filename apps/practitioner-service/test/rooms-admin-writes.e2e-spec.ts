import type { INestApplication } from '@nestjs/common';
import { FhirClientError, type FhirClient } from '@medcenter/fhir';
import { MEDCENTER_EXT } from '@medcenter/terminology';
import request from 'supertest';

import { auditedResource, committedAudit, committedEntries, transactionResponder } from '@medcenter/testing';
import { bootWithFhir, createFhirStub, ROOM_PHYSICAL_TYPE_SYSTEM, storedRoom, TOKENS } from './rooms-harness';

jest.mock('jose', () => jest.requireActual<typeof import('@medcenter/testing')>('@medcenter/testing').decodeOnlyJose());

const ROOMS = '/api/v1/admin/rooms';
const ROOM_URL = `${ROOMS}/room-204`;
const OTHER_EXTENSION = { url: 'https://example.org/StructureDefinition/other', valueString: 'keep-me' };

describe('Rooms admin writes (e2e)', () => {
  let app: INestApplication;
  let fhir: jest.Mocked<FhirClient>;

  beforeEach(async () => {
    fhir = createFhirStub();
    app = await bootWithFhir(fhir);
  });

  afterEach(async () => {
    await app?.close();
  });

  describe('POST /api/v1/admin/rooms', () => {
    beforeEach(() => {
      fhir.batch.mockImplementation(transactionResponder());
    });

    it('should create a room Location and answer 201 with the room view when an admin posts a valid body', async () => {
      const response = await request(app.getHttpServer())
        .post(ROOMS)
        .set('Authorization', TOKENS.admin)
        .send({ identifier: '204-Х', name: 'Кабинет 204', floor: 2, description: 'Окна во двор' })
        .expect(201);

      const [room] = committedEntries(fhir);
      expect(room?.request).toMatchObject({ method: 'PUT', url: 'Location?identifier=204-%D0%A5' });
      expect(committedAudit(fhir)).toMatchObject({ action: 'C', source: { observer: { display: 'practitioner-service' } }, entity: [auditedResource('Location', room?.resource?.id), expect.anything()] });
      expect(room?.resource).toEqual({
        resourceType: 'Location',
        id: expect.any(String),
        identifier: [{ value: '204-Х' }],
        name: 'Кабинет 204',
        description: 'Окна во двор',
        extension: [{ url: MEDCENTER_EXT.ROOM_FLOOR, valueInteger: 2 }],
        physicalType: { coding: [{ system: ROOM_PHYSICAL_TYPE_SYSTEM, code: 'ro', display: 'room' }] },
      });
      expect(response.body).toEqual({
        id: room?.resource?.id,
        identifier: '204-Х',
        name: 'Кабинет 204',
        description: 'Окна во двор',
        floor: 2,
        isActive: true,
      });
    });

    it('should leave the optional elements out of the Location when only identifier and name are posted', async () => {
      await request(app.getHttpServer())
        .post(ROOMS)
        .set('Authorization', TOKENS.admin)
        .send({ identifier: '101', name: 'Кабинет 101' })
        .expect(201);

      const created = committedEntries(fhir)[0]?.resource;
      expect(created).not.toHaveProperty('extension');
      expect(created?.['description']).toBeUndefined();
    });

    it.each([['an empty description', ''], ['a blank description', '   '], ['a null description', null]])(
      'should leave the description out of the Location when the body carries %s',
      async (_label, description) => {
        await request(app.getHttpServer())
          .post(ROOMS)
          .set('Authorization', TOKENS.admin)
          .send({ identifier: '101', name: 'Кабинет 101', description, floor: null })
          .expect(201);

        const created = committedEntries(fhir)[0]?.resource;
        expect(created).not.toHaveProperty('description');
        expect(created).not.toHaveProperty('extension');
      },
    );

    it('should store the name without its edge spaces', async () => {
      await request(app.getHttpServer())
        .post(ROOMS)
        .set('Authorization', TOKENS.admin)
        .send({ identifier: '101', name: '  Кабинет 101 ' })
        .expect(201);

      expect(committedEntries(fhir)[0]?.resource).toMatchObject({ name: 'Кабинет 101' });
    });

    it('should drop properties no DTO declares when the body smuggles id, status and meta', async () => {
      await request(app.getHttpServer())
        .post(ROOMS)
        .set('Authorization', TOKENS.admin)
        .send({ identifier: '101', name: 'Кабинет 101', id: 'hijacked', status: 'inactive', meta: { tag: [] } })
        .expect(201);

      const created = committedEntries(fhir)[0]?.resource;
      expect(created?.['id']).not.toBe('hijacked');
      expect(created).not.toHaveProperty('status');
      expect(created).not.toHaveProperty('meta');
    });

    it.each([
      ['no identifier', { name: 'Кабинет 204' }],
      ['an empty identifier', { identifier: '', name: 'Кабинет 204' }],
      ['an identifier above 50 characters', { identifier: 'x'.repeat(51), name: 'Кабинет 204' }],
      ['no name', { identifier: '204-Х' }],
      ['an empty name', { identifier: '204-Х', name: '' }],
      ['a blank name', { identifier: '204-Х', name: '   ' }],
      ['a null name', { identifier: '204-Х', name: null }],
      ['a null identifier', { identifier: null, name: 'Кабинет 204' }],
      ['a name above 200 characters', { identifier: '204-Х', name: 'x'.repeat(201) }],
      ['a numeric name', { identifier: '204-Х', name: 204 }],
      ['floor 0', { identifier: '204-Х', name: 'Кабинет 204', floor: 0 }],
      ['floor 11', { identifier: '204-Х', name: 'Кабинет 204', floor: 11 }],
      ['a fractional floor', { identifier: '204-Х', name: 'Кабинет 204', floor: 2.5 }],
      ['a floor sent as text', { identifier: '204-Х', name: 'Кабинет 204', floor: 'second' }],
      ['a description above 500 characters', { identifier: '204-Х', name: 'Кабинет 204', description: 'x'.repeat(501) }],
    ])('should answer 400 VALIDATION_ERROR before HAPI is called when the body has %s', async (_label, body) => {
      const response = await request(app.getHttpServer()).post(ROOMS).set('Authorization', TOKENS.admin).send(body).expect(400);

      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ status: 400, errorCode: 'VALIDATION_ERROR' });
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it('should answer 400 VALIDATION_ERROR when the body is empty', async () => {
      const response = await request(app.getHttpServer()).post(ROOMS).set('Authorization', TOKENS.admin).expect(400);

      expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it('should answer 409 CONFLICT when HAPI refuses the create as a duplicate', async () => {
      fhir.batch.mockRejectedValue(new FhirClientError('POST', 'http://hapi:8080/fhir', 412, '{}'));

      const response = await request(app.getHttpServer())
        .post(ROOMS)
        .set('Authorization', TOKENS.admin)
        .send({ identifier: '204-Х', name: 'Кабинет 204' })
        .expect(409);

      expect(response.body).toMatchObject({ status: 409, errorCode: 'CONFLICT' });
    });

    it('should answer 502 INTERNAL without the HAPI address when the FHIR server is down', async () => {
      fhir.batch.mockRejectedValue(new FhirClientError('POST', 'http://hapi:8080/fhir', 503, 'secret outcome'));

      const response = await request(app.getHttpServer())
        .post(ROOMS)
        .set('Authorization', TOKENS.admin)
        .send({ identifier: '204-Х', name: 'Кабинет 204' })
        .expect(502);

      expect(response.body).toMatchObject({ status: 502, errorCode: 'INTERNAL' });
      expect(JSON.stringify(response.body)).not.toMatch(/hapi:8080|secret outcome/);
    });
  });

  describe('a Location that is not a room', () => {
    beforeEach(() => {
      fhir.read.mockResolvedValue(storedRoom({ id: 'building-1', physicalType: { coding: [{ system: ROOM_PHYSICAL_TYPE_SYSTEM, code: 'bu', display: 'Building' }] } }));
      fhir.batch.mockImplementation(transactionResponder());
    });

    it.each([
      ['PATCH', 'patch', { name: 'Кабинет 1' }],
      ['DELETE', 'delete', undefined],
    ] as const)('should answer 404 NOT_FOUND and write nothing when it is the target of %s', async (_label, method, body) => {
      const response = await request(app.getHttpServer())[method](`${ROOMS}/building-1`).set('Authorization', TOKENS.admin).send(body).expect(404);

      expect(response.body).toMatchObject({ status: 404, errorCode: 'NOT_FOUND' });
      expect(fhir.batch).not.toHaveBeenCalled();
      expect(fhir.search).not.toHaveBeenCalled();
    });

    it('should answer 404 NOT_FOUND for its usage', async () => {
      const response = await request(app.getHttpServer()).get(`${ROOMS}/building-1/usage`).set('Authorization', TOKENS.admin).expect(404);

      expect(response.body).toMatchObject({ status: 404, errorCode: 'NOT_FOUND' });
      expect(fhir.search).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /api/v1/admin/rooms/{id}', () => {
    beforeEach(() => {
      fhir.read.mockResolvedValue(storedRoom({ extension: [{ url: MEDCENTER_EXT.ROOM_FLOOR, valueInteger: 2 }, OTHER_EXTENSION] }));
      fhir.batch.mockImplementation(transactionResponder());
    });

    it('should read the Location, merge only the patched fields and answer 200 when an admin renames the room', async () => {
      const response = await request(app.getHttpServer())
        .patch(ROOM_URL)
        .set('Authorization', TOKENS.admin)
        .send({ name: 'Кабинет 204А' })
        .expect(200);

      expect(fhir.read).toHaveBeenCalledWith('Location', 'room-204');
      const [update] = committedEntries(fhir);
      const merged = update?.resource;
      expect([update?.request.method, update?.request.url]).toEqual(['PUT', 'Location/room-204']);
      expect(committedAudit(fhir)).toMatchObject({ action: 'U', entity: [auditedResource('Location', 'room-204'), expect.anything()] });
      expect(merged).toMatchObject({ name: 'Кабинет 204А', description: 'Окна во двор', identifier: [{ value: '204-Х' }] });
      expect(response.body).toMatchObject({ id: 'room-204', name: 'Кабинет 204А', floor: 2, isActive: true });
    });

    it('should replace only the floor entry and keep unrelated extensions when the floor is patched', async () => {
      await request(app.getHttpServer()).patch(ROOM_URL).set('Authorization', TOKENS.admin).send({ floor: 5 }).expect(200);

      const merged = committedEntries(fhir)[0]?.resource;
      expect(merged?.['extension']).toEqual([OTHER_EXTENSION, { url: MEDCENTER_EXT.ROOM_FLOOR, valueInteger: 5 }]);
    });

    it('should remove only the floor entry when the floor is patched to null', async () => {
      const response = await request(app.getHttpServer()).patch(ROOM_URL).set('Authorization', TOKENS.admin).send({ floor: null }).expect(200);

      const merged = committedEntries(fhir)[0]?.resource;
      expect(merged?.['extension']).toEqual([OTHER_EXTENSION]);
      expect(response.body).not.toHaveProperty('floor');
    });

    it.each([['an empty description', ''], ['a blank description', '   '], ['a null description', null]])(
      'should write the Location without a description when the patch carries %s',
      async (_label, description) => {
        const response = await request(app.getHttpServer())
          .patch(ROOM_URL)
          .set('Authorization', TOKENS.admin)
          .send({ identifier: '204-Х', name: 'Кабинет 204А', description })
          .expect(200);

        const merged = committedEntries(fhir)[0]?.resource;
        expect(merged).toMatchObject({ name: 'Кабинет 204А' });
        expect(merged).not.toHaveProperty('description');
        expect(response.body).not.toHaveProperty('description');
      },
    );

    it('should store the name without its edge spaces', async () => {
      await request(app.getHttpServer()).patch(ROOM_URL).set('Authorization', TOKENS.admin).send({ name: '  Кабинет 204А ' }).expect(200);

      expect(committedEntries(fhir)[0]?.resource).toMatchObject({ name: 'Кабинет 204А' });
    });

    it.each([
      ['an empty body', {}],
      ['the stored values', { identifier: '204-Х', name: 'Кабинет 204', description: 'Окна во двор', floor: 2 }],
    ])('should answer 200 with the room and write no version and no AuditEvent when the patch is %s', async (_label, body) => {
      const response = await request(app.getHttpServer()).patch(ROOM_URL).set('Authorization', TOKENS.admin).send(body).expect(200);

      expect(fhir.batch).not.toHaveBeenCalled();
      expect(response.body).toEqual({ id: 'room-204', identifier: '204-Х', name: 'Кабинет 204', description: 'Окна во двор', floor: 2, isActive: true });
    });

    it('should keep the stored resource identity when the body smuggles id and physicalType', async () => {
      await request(app.getHttpServer())
        .patch(ROOM_URL)
        .set('Authorization', TOKENS.admin)
        .send({ name: 'Кабинет 204А', id: 'hijacked', physicalType: { coding: [{ code: 'wi' }] } })
        .expect(200);

      const merged = committedEntries(fhir)[0]?.resource;
      expect(committedEntries(fhir)[0]?.request.url).toBe('Location/room-204');
      expect(merged?.['id']).toBe('room-204');
      expect(merged?.['physicalType']).toEqual({ coding: [{ system: ROOM_PHYSICAL_TYPE_SYSTEM, code: 'ro', display: 'room' }] });
    });

    it.each([
      ['an empty name', { name: '' }],
      ['a blank name', { name: '   ' }],
      ['a null name', { name: null }],
      ['a name above 200 characters', { name: 'x'.repeat(201) }],
      ['an empty identifier', { identifier: '' }],
      ['a blank identifier', { identifier: '   ' }],
      ['a null identifier', { identifier: null }],
      ['floor 11', { floor: 11 }],
      ['floor 0', { floor: 0 }],
      ['a floor sent as text', { floor: 'second' }],
      ['a description above 500 characters', { description: 'x'.repeat(501) }],
    ])('should answer 400 VALIDATION_ERROR before HAPI is called when the patch has %s', async (_label, body) => {
      const response = await request(app.getHttpServer()).patch(ROOM_URL).set('Authorization', TOKENS.admin).send(body).expect(400);

      expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
      expect(fhir.read).not.toHaveBeenCalled();
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it('should answer 404 NOT_FOUND and write nothing when the room does not exist', async () => {
      fhir.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi:8080/fhir/Location/room-204', 404, '{}'));

      const response = await request(app.getHttpServer())
        .patch(ROOM_URL)
        .set('Authorization', TOKENS.admin)
        .send({ name: 'Кабинет 204А' })
        .expect(404);

      expect(response.body).toMatchObject({ status: 404, errorCode: 'NOT_FOUND' });
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it('should answer 409 CONFLICT when HAPI rejects the update as a stale version', async () => {
      fhir.batch.mockRejectedValue(new FhirClientError('POST', 'http://hapi:8080/fhir', 412, '{}'));

      const response = await request(app.getHttpServer())
        .patch(ROOM_URL)
        .set('Authorization', TOKENS.admin)
        .send({ name: 'Кабинет 204А' })
        .expect(409);

      expect(response.body).toMatchObject({ errorCode: 'CONFLICT' });
    });

    it('should answer 500 INTERNAL without the OperationOutcome when HAPI rejects a resource this service built', async () => {
      fhir.batch.mockRejectedValue(new FhirClientError('POST', 'http://hapi:8080/fhir', 422, 'HAPI-1234 details'));

      const response = await request(app.getHttpServer())
        .patch(ROOM_URL)
        .set('Authorization', TOKENS.admin)
        .send({ name: 'Кабинет 204А' })
        .expect(500);

      expect(response.body).toMatchObject({ status: 500, errorCode: 'INTERNAL' });
      expect(JSON.stringify(response.body)).not.toContain('HAPI-1234');
    });
  });
});
