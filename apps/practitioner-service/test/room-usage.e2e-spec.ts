import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createValidationPipe } from '@medcenter/common';
import { FHIR_CLIENT, FhirClientError, type FhirClient, type FhirSearchResult } from '@medcenter/fhir';
import request from 'supertest';

import { AppModule } from '../src/app/app.module';
import { applyE2eEnv } from './e2e-env';
import { ADMIN_SCOPE, bearer, DOCTOR_SCOPE } from './e2e-tokens';

jest.mock('jose', () => jest.requireActual<typeof import('./e2e-tokens')>('./e2e-tokens').decodeOnlyJose());

const USAGE = '/api/v1/admin/rooms/room-204/usage';

function bundle(resources: ReadonlyArray<Record<string, unknown>>): FhirSearchResult {
  return { entry: resources.map((resource) => ({ resource: { resourceType: 'Unknown', ...resource } })) };
}

const SCHEDULE = {
  resourceType: 'Schedule',
  id: 'sched-1',
  active: true,
  actor: [{ reference: 'PractitionerRole/role-7' }, { reference: 'Location/room-204' }],
};

const BOOKED = {
  resourceType: 'Slot',
  id: 'slot-1',
  status: 'busy',
  start: '2099-11-02T09:00:00.000Z',
  end: '2099-11-02T09:30:00.000Z',
  schedule: { reference: 'Schedule/sched-1' },
};

function createFhirStub(schedules: ReadonlyArray<Record<string, unknown>>): jest.Mocked<FhirClient> {
  const stub = { read: jest.fn(), search: jest.fn(), delete: jest.fn() } as unknown as jest.Mocked<FhirClient>;
  stub.read.mockResolvedValue({ resourceType: 'Location', id: 'room-204' });
  stub.search.mockImplementation(async (resourceType) =>
    resourceType === 'Schedule' ? bundle(schedules) : bundle([BOOKED]),
  );
  return stub;
}

/**
 * API §4.7 (room usage) and the §4.6 `ROOM_IN_USE` guard it mirrors, through
 * the real guard stack, validation pipe and problem filter. HAPI is stubbed.
 */
describe('Room usage (e2e)', () => {
  const admin = bearer({ role: 'ADMIN', scope: ADMIN_SCOPE });
  let app: INestApplication;
  let fhir: jest.Mocked<FhirClient>;

  async function boot(schedules: ReadonlyArray<Record<string, unknown>>): Promise<void> {
    applyE2eEnv();
    fhir = createFhirStub(schedules);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FHIR_CLIENT)
      .useValue(fhir)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  }

  afterEach(async () => {
    await app?.close();
  });

  describe('GET /api/v1/admin/rooms/{id}/usage', () => {
    beforeEach(async () => {
      await boot([SCHEDULE]);
    });

    it('should reject the call with 401 UNAUTHENTICATED when there is no token', async () => {
      // Act
      const response = await request(app.getHttpServer()).get(USAGE).expect(401);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'UNAUTHENTICATED' });
    });

    it('should reject the call with 403 FORBIDDEN_ROLE when the token belongs to a doctor', async () => {
      // Arrange
      const token = bearer({ role: 'DOCTOR', scope: DOCTOR_SCOPE, fhirUser: 'PractitionerRole/role-7' });

      // Act
      const response = await request(app.getHttpServer()).get(USAGE).set('Authorization', token).expect(403);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_ROLE' });
      expect(fhir.read).not.toHaveBeenCalled();
    });

    it('should reject the call with 403 FORBIDDEN_SCOPE when the admin token lacks user/*.read', async () => {
      // Arrange
      const token = bearer({ role: 'ADMIN', scope: 'user/*.write' });

      // Act
      const response = await request(app.getHttpServer()).get(USAGE).set('Authorization', token).expect(403);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_SCOPE' });
    });

    it('should list the referencing schedule and its upcoming booking when an admin asks', async () => {
      // Act
      const response = await request(app.getHttpServer()).get(USAGE).set('Authorization', admin).expect(200);

      // Assert
      expect(response.body).toMatchObject({ roomId: 'room-204', inUse: true, truncated: false });
      expect(response.body.items).toEqual([
        { resourceType: 'Schedule', id: 'sched-1', isActive: true, display: 'PractitionerRole/role-7 · активно' },
        {
          resourceType: 'Slot',
          id: 'slot-1',
          scheduleId: 'sched-1',
          start: '2099-11-02T09:00:00.000Z',
          end: '2099-11-02T09:30:00.000Z',
          display: '02.11.2099 12:00–12:30 · запись · PractitionerRole/role-7',
        },
      ]);
    });

    it('should reject the call with 400 VALIDATION_ERROR when the id is not a FHIR id', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/rooms/a,b/usage')
        .set('Authorization', admin)
        .expect(400);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
      expect(fhir.read).not.toHaveBeenCalled();
    });

    it('should answer 404 NOT_FOUND when the room does not exist', async () => {
      // Arrange
      fhir.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi:8080/fhir/Location/ghost', 404, '{}'));

      // Act
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/rooms/ghost/usage')
        .set('Authorization', admin)
        .expect(404);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'NOT_FOUND' });
    });
  });

  describe('DELETE /api/v1/admin/rooms/{id} (the rule usage mirrors)', () => {
    it('should refuse with 409 when the usage view reports the room in use', async () => {
      // Arrange
      await boot([SCHEDULE]);

      // Act
      const response = await request(app.getHttpServer())
        .delete('/api/v1/admin/rooms/room-204')
        .set('Authorization', admin)
        .expect(409);

      // Assert — `ROOM_IN_USE` is not in `ERROR_CODES` yet, so the filter answers `errorCode: CONFLICT`
      // and the label travels in `detail`. Switch the assertion to `errorCode` once the contract has it.
      expect(response.body).toMatchObject({ status: 409, errorCode: 'CONFLICT' });
      expect(response.body.detail).toContain('ROOM_IN_USE');
      expect(fhir.search).toHaveBeenCalledWith('Schedule', { actor: 'Location/room-204', _count: 1 });
      expect(fhir.delete).not.toHaveBeenCalled();
    });

    it('should delete with 204 when the usage view reports the room free', async () => {
      // Arrange
      await boot([]);

      // Act
      await request(app.getHttpServer()).delete('/api/v1/admin/rooms/room-204').set('Authorization', admin).expect(204);

      // Assert
      expect(fhir.delete).toHaveBeenCalledWith('Location', 'room-204');
    });
  });

  describe('id validation on admin writes', () => {
    beforeEach(async () => {
      await boot([SCHEDULE]);
    });

    it('should reject a delete with 400 VALIDATION_ERROR before HAPI is called when the id carries a comma', async () => {
      // Act — `actor=Location/a,b` would be an OR over another room.
      const response = await request(app.getHttpServer())
        .delete('/api/v1/admin/rooms/a,b')
        .set('Authorization', admin)
        .expect(400);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
      expect(fhir.read).not.toHaveBeenCalled();
      expect(fhir.search).not.toHaveBeenCalled();
      expect(fhir.delete).not.toHaveBeenCalled();
    });

    it('should reject a patch with 400 VALIDATION_ERROR before HAPI is called when the id is only dots', async () => {
      // Act — `Location/..` collapses to the FHIR base URL inside fetch.
      const response = await request(app.getHttpServer())
        .patch('/api/v1/admin/rooms/..')
        .set('Authorization', admin)
        .send({ name: 'Кабинет 205' })
        .expect(400);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
      expect(fhir.read).not.toHaveBeenCalled();
    });
  });
});
