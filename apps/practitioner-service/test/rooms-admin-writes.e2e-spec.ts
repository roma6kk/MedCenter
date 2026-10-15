import type { INestApplication } from '@nestjs/common';
import { FhirClientError, type FhirClient } from '@medcenter/fhir';
import { MEDCENTER_EXT } from '@medcenter/terminology';
import request from 'supertest';

import { bootWithFhir, createFhirStub, ROOM_PHYSICAL_TYPE_SYSTEM, storedRoom, TOKENS } from './rooms-harness';

jest.mock('jose', () => jest.requireActual<typeof import('./e2e-tokens')>('./e2e-tokens').decodeOnlyJose());

const ROOMS = '/api/v1/admin/rooms';
const ROOM_URL = `${ROOMS}/room-204`;
const OTHER_EXTENSION = { url: 'https://example.org/StructureDefinition/other', valueString: 'keep-me' };

/**
 * Admin room writes (API §4.4 create, §4.5 update) through the real guard stack,
 * validation pipe and problem filter. HAPI is a scripted `FhirClient`, so the
 * FHIR resource each call produces is asserted exactly.
 */
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
      fhir.create.mockImplementation(async (_type, resource) => ({ ...resource, id: 'room-new' }));
    });

    it('should create a room Location and answer 201 with the room view when an admin posts a valid body', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .post(ROOMS)
        .set('Authorization', TOKENS.admin)
        .send({ identifier: '204-Х', name: 'Кабинет 204', floor: 2, description: 'Окна во двор' })
        .expect(201);

      // Assert
      expect(fhir.create).toHaveBeenCalledWith('Location', {
        resourceType: 'Location',
        identifier: [{ value: '204-Х' }],
        name: 'Кабинет 204',
        description: 'Окна во двор',
        extension: [{ url: MEDCENTER_EXT.ROOM_FLOOR, valueInteger: 2 }],
        physicalType: { coding: [{ system: ROOM_PHYSICAL_TYPE_SYSTEM, code: 'ro', display: 'room' }] },
      });
      expect(response.body).toEqual({
        id: 'room-new',
        identifier: '204-Х',
        name: 'Кабинет 204',
        description: 'Окна во двор',
        floor: 2,
        isActive: true,
      });
    });

    it('should leave the optional elements out of the Location when only identifier and name are posted', async () => {
      // Act
      await request(app.getHttpServer())
        .post(ROOMS)
        .set('Authorization', TOKENS.admin)
        .send({ identifier: '101', name: 'Кабинет 101' })
        .expect(201);

      // Assert
      const [, created] = fhir.create.mock.calls[0] ?? [];
      expect(created).not.toHaveProperty('extension');
      expect(created?.['description']).toBeUndefined();
    });

    it('should drop properties no DTO declares when the body smuggles id, status and meta', async () => {
      // Act
      await request(app.getHttpServer())
        .post(ROOMS)
        .set('Authorization', TOKENS.admin)
        .send({ identifier: '101', name: 'Кабинет 101', id: 'hijacked', status: 'inactive', meta: { tag: [] } })
        .expect(201);

      // Assert
      const [, created] = fhir.create.mock.calls[0] ?? [];
      expect(created).not.toHaveProperty('id');
      expect(created).not.toHaveProperty('status');
      expect(created).not.toHaveProperty('meta');
    });

    it.each([
      ['no identifier', { name: 'Кабинет 204' }],
      ['an empty identifier', { identifier: '', name: 'Кабинет 204' }],
      ['an identifier above 50 characters', { identifier: 'x'.repeat(51), name: 'Кабинет 204' }],
      ['no name', { identifier: '204-Х' }],
      ['an empty name', { identifier: '204-Х', name: '' }],
      ['a name above 200 characters', { identifier: '204-Х', name: 'x'.repeat(201) }],
      ['a numeric name', { identifier: '204-Х', name: 204 }],
      ['floor 0', { identifier: '204-Х', name: 'Кабинет 204', floor: 0 }],
      ['floor 11', { identifier: '204-Х', name: 'Кабинет 204', floor: 11 }],
      ['a fractional floor', { identifier: '204-Х', name: 'Кабинет 204', floor: 2.5 }],
      ['a floor sent as text', { identifier: '204-Х', name: 'Кабинет 204', floor: 'second' }],
      ['a description above 500 characters', { identifier: '204-Х', name: 'Кабинет 204', description: 'x'.repeat(501) }],
    ])('should answer 400 VALIDATION_ERROR before HAPI is called when the body has %s', async (_label, body) => {
      // Act
      const response = await request(app.getHttpServer()).post(ROOMS).set('Authorization', TOKENS.admin).send(body).expect(400);

      // Assert
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ status: 400, errorCode: 'VALIDATION_ERROR' });
      expect(fhir.create).not.toHaveBeenCalled();
    });

    it('should answer 400 VALIDATION_ERROR when the body is empty', async () => {
      // Act
      const response = await request(app.getHttpServer()).post(ROOMS).set('Authorization', TOKENS.admin).expect(400);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
      expect(fhir.create).not.toHaveBeenCalled();
    });

    it('should answer 409 CONFLICT when HAPI refuses the create as a duplicate', async () => {
      // Arrange
      fhir.create.mockRejectedValue(new FhirClientError('POST', 'http://hapi:8080/fhir/Location', 412, '{}'));

      // Act
      const response = await request(app.getHttpServer())
        .post(ROOMS)
        .set('Authorization', TOKENS.admin)
        .send({ identifier: '204-Х', name: 'Кабинет 204' })
        .expect(409);

      // Assert
      expect(response.body).toMatchObject({ status: 409, errorCode: 'CONFLICT' });
    });

    it('should answer 502 INTERNAL without the HAPI address when the FHIR server is down', async () => {
      // Arrange
      fhir.create.mockRejectedValue(new FhirClientError('POST', 'http://hapi:8080/fhir/Location', 503, 'secret outcome'));

      // Act
      const response = await request(app.getHttpServer())
        .post(ROOMS)
        .set('Authorization', TOKENS.admin)
        .send({ identifier: '204-Х', name: 'Кабинет 204' })
        .expect(502);

      // Assert
      expect(response.body).toMatchObject({ status: 502, errorCode: 'INTERNAL' });
      expect(JSON.stringify(response.body)).not.toMatch(/hapi:8080|secret outcome/);
    });
  });

  describe('PATCH /api/v1/admin/rooms/{id}', () => {
    beforeEach(() => {
      fhir.read.mockResolvedValue(storedRoom({ extension: [{ url: MEDCENTER_EXT.ROOM_FLOOR, valueInteger: 2 }, OTHER_EXTENSION] }));
      fhir.update.mockImplementation(async (_type, id, resource) => ({ ...resource, id }));
    });

    it('should read the Location, merge only the patched fields and answer 200 when an admin renames the room', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .patch(ROOM_URL)
        .set('Authorization', TOKENS.admin)
        .send({ name: 'Кабинет 204А' })
        .expect(200);

      // Assert
      expect(fhir.read).toHaveBeenCalledWith('Location', 'room-204');
      const [type, id, merged] = fhir.update.mock.calls[0] ?? [];
      expect([type, id]).toEqual(['Location', 'room-204']);
      expect(merged).toMatchObject({ name: 'Кабинет 204А', description: 'Окна во двор', identifier: [{ value: '204-Х' }] });
      expect(response.body).toMatchObject({ id: 'room-204', name: 'Кабинет 204А', floor: 2, isActive: true });
    });

    it('should replace only the floor entry and keep unrelated extensions when the floor is patched', async () => {
      // Act
      await request(app.getHttpServer()).patch(ROOM_URL).set('Authorization', TOKENS.admin).send({ floor: 5 }).expect(200);

      // Assert
      const [, , merged] = fhir.update.mock.calls[0] ?? [];
      expect(merged?.['extension']).toEqual([OTHER_EXTENSION, { url: MEDCENTER_EXT.ROOM_FLOOR, valueInteger: 5 }]);
    });

    it('should keep the stored resource identity when the body smuggles id and physicalType', async () => {
      // Act
      await request(app.getHttpServer())
        .patch(ROOM_URL)
        .set('Authorization', TOKENS.admin)
        .send({ name: 'Кабинет 204А', id: 'hijacked', physicalType: { coding: [{ code: 'wi' }] } })
        .expect(200);

      // Assert
      const [, id, merged] = fhir.update.mock.calls[0] ?? [];
      expect(id).toBe('room-204');
      expect(merged?.['id']).toBe('room-204');
      expect(merged?.['physicalType']).toEqual({ coding: [{ system: ROOM_PHYSICAL_TYPE_SYSTEM, code: 'ro', display: 'room' }] });
    });

    it.each([
      ['an empty name', { name: '' }],
      ['a name above 200 characters', { name: 'x'.repeat(201) }],
      ['an empty identifier', { identifier: '' }],
      ['floor 11', { floor: 11 }],
      ['floor 0', { floor: 0 }],
      ['a floor sent as text', { floor: 'second' }],
      ['a description above 500 characters', { description: 'x'.repeat(501) }],
    ])('should answer 400 VALIDATION_ERROR before HAPI is called when the patch has %s', async (_label, body) => {
      // Act
      const response = await request(app.getHttpServer()).patch(ROOM_URL).set('Authorization', TOKENS.admin).send(body).expect(400);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
      expect(fhir.read).not.toHaveBeenCalled();
      expect(fhir.update).not.toHaveBeenCalled();
    });

    it('should answer 404 NOT_FOUND and write nothing when the room does not exist', async () => {
      // Arrange
      fhir.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi:8080/fhir/Location/room-204', 404, '{}'));

      // Act
      const response = await request(app.getHttpServer())
        .patch(ROOM_URL)
        .set('Authorization', TOKENS.admin)
        .send({ name: 'Кабинет 204А' })
        .expect(404);

      // Assert
      expect(response.body).toMatchObject({ status: 404, errorCode: 'NOT_FOUND' });
      expect(fhir.update).not.toHaveBeenCalled();
    });

    it('should answer 409 CONFLICT when HAPI rejects the update as a stale version', async () => {
      // Arrange
      fhir.update.mockRejectedValue(new FhirClientError('PUT', 'http://hapi:8080/fhir/Location/room-204', 412, '{}'));

      // Act
      const response = await request(app.getHttpServer())
        .patch(ROOM_URL)
        .set('Authorization', TOKENS.admin)
        .send({ name: 'Кабинет 204А' })
        .expect(409);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'CONFLICT' });
    });

    it('should answer 500 INTERNAL without the OperationOutcome when HAPI rejects a resource this service built', async () => {
      // Arrange
      fhir.update.mockRejectedValue(new FhirClientError('PUT', 'http://hapi:8080/fhir/Location/room-204', 422, 'HAPI-1234 details'));

      // Act
      const response = await request(app.getHttpServer())
        .patch(ROOM_URL)
        .set('Authorization', TOKENS.admin)
        .send({ name: 'Кабинет 204А' })
        .expect(500);

      // Assert
      expect(response.body).toMatchObject({ status: 500, errorCode: 'INTERNAL' });
      expect(JSON.stringify(response.body)).not.toContain('HAPI-1234');
    });
  });
});
