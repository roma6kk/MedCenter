import type { INestApplication } from '@nestjs/common';
import { FhirClientError, type FhirClient, type FhirSearchResult } from '@medcenter/fhir';
import { translationExtension } from '@medcenter/fhir-mappers';
import request from 'supertest';

import { ADMIN_SCOPE, auditedResource, bearer, committedAudit, committedEntries, DOCTOR_SCOPE, transactionResponder } from '@medcenter/testing';
import { bootWithFhir } from './rooms-harness';

const IS_ROOM = { physicalType: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/location-physical-type', code: 'ro' }] } };

jest.mock('jose', () => jest.requireActual<typeof import('@medcenter/testing')>('@medcenter/testing').decodeOnlyJose());

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

const ROLE = { resourceType: 'PractitionerRole', id: 'role-7', practitioner: { reference: 'Practitioner/prac-1' } };

function inEnglish(content: string): Record<string, unknown> {
  return { extension: [translationExtension('en', content)] };
}

const DOCTOR = {
  resourceType: 'Practitioner',
  id: 'prac-1',
  name: [{ family: 'Иванов', _family: inEnglish('Ivanov'), given: ['Иван'], _given: [inEnglish('Ivan')] }],
};
const SERVICE = { resourceType: 'HealthcareService', id: 'svc-1', name: 'Консультация терапевта', _name: inEnglish('Therapist consultation') };

interface Referrers {
  readonly roles?: ReadonlyArray<Record<string, unknown>>;
  readonly services?: ReadonlyArray<Record<string, unknown>>;
}

function createFhirStub(schedules: ReadonlyArray<Record<string, unknown>>, { roles = [], services = [] }: Referrers = {}): jest.Mocked<FhirClient> {
  const stub = { read: jest.fn(), search: jest.fn(), delete: jest.fn(), batch: jest.fn().mockImplementation(transactionResponder()) } as unknown as jest.Mocked<FhirClient>;
  stub.read.mockResolvedValue({ resourceType: 'Location', ...IS_ROOM, id: 'room-204' });
  stub.search.mockImplementation(async (resourceType) => {
    switch (resourceType) {
      case 'Schedule':
        return bundle(schedules);
      case 'PractitionerRole':
        return bundle(roles);
      case 'HealthcareService':
        return bundle(services);
      default:
        return bundle([BOOKED]);
    }
  });
  return stub;
}

describe('Room usage (e2e)', () => {
  const admin = bearer({ role: 'ADMIN', scope: ADMIN_SCOPE });
  let app: INestApplication;
  let fhir: jest.Mocked<FhirClient>;

  async function boot(schedules: ReadonlyArray<Record<string, unknown>>, referrers: Referrers = {}): Promise<void> {
    fhir = createFhirStub(schedules, referrers);
    app = await bootWithFhir(fhir);
  }

  afterEach(async () => {
    await app?.close();
  });

  describe('GET /api/v1/admin/rooms/{id}/usage', () => {
    beforeEach(async () => {
      await boot([SCHEDULE]);
    });

    it('should reject the call with 401 UNAUTHENTICATED when there is no token', async () => {
      const response = await request(app.getHttpServer()).get(USAGE).expect(401);

      expect(response.body).toMatchObject({ errorCode: 'UNAUTHENTICATED' });
    });

    it('should reject the call with 403 FORBIDDEN_ROLE when the token belongs to a doctor', async () => {
      const token = bearer({ role: 'DOCTOR', scope: DOCTOR_SCOPE, fhirUser: 'PractitionerRole/role-7' });

      const response = await request(app.getHttpServer()).get(USAGE).set('Authorization', token).expect(403);

      expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_ROLE' });
      expect(fhir.read).not.toHaveBeenCalled();
    });

    it('should reject the call with 403 FORBIDDEN_SCOPE when the admin token lacks user/*.read', async () => {
      const token = bearer({ role: 'ADMIN', scope: 'user/*.write' });

      const response = await request(app.getHttpServer()).get(USAGE).set('Authorization', token).expect(403);

      expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_SCOPE' });
    });

    it('should list the referencing schedule and its upcoming booking when an admin asks', async () => {
      const response = await request(app.getHttpServer()).get(USAGE).set('Authorization', admin).expect(200);

      expect(response.body).toMatchObject({ roomId: 'room-204', inUse: true, truncated: false });
      expect(response.body.items).toEqual([
        { resourceType: 'Schedule', id: 'sched-1', isActive: true, display: 'PractitionerRole/role-7' },
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

    it('should word the lines in English when the admin UI asks for it with Accept-Language', async () => {
      await app.close();
      await boot([], { roles: [ROLE, DOCTOR], services: [SERVICE] });

      const english = await request(app.getHttpServer()).get(USAGE).set('Authorization', admin).set('Accept-Language', 'en').expect(200);
      const russian = await request(app.getHttpServer()).get(USAGE).set('Authorization', admin).expect(200);

      expect(english.body).toMatchObject({ inUse: true, truncated: false });
      expect(english.body.items).toEqual([
        { resourceType: 'PractitionerRole', id: 'role-7', isActive: true, display: 'Ivanov Ivan' },
        { resourceType: 'HealthcareService', id: 'svc-1', isActive: true, display: 'Therapist consultation' },
      ]);
      expect(russian.body.items.map((item: { display: string }) => item.display)).toEqual(['Иванов Иван', 'Консультация терапевта']);
    });

    it('should reject the call with 400 VALIDATION_ERROR when the id is not a FHIR id', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/rooms/a,b/usage')
        .set('Authorization', admin)
        .expect(400);

      expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
      expect(fhir.read).not.toHaveBeenCalled();
    });

    it('should answer 404 NOT_FOUND when the room does not exist', async () => {
      fhir.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi:8080/fhir/Location/ghost', 404, '{}'));

      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/rooms/ghost/usage')
        .set('Authorization', admin)
        .expect(404);

      expect(response.body).toMatchObject({ errorCode: 'NOT_FOUND' });
    });
  });

  describe('DELETE /api/v1/admin/rooms/{id} (the rule usage mirrors)', () => {
    it('should refuse with 409 when the usage view reports the room in use', async () => {
      await boot([SCHEDULE]);

      const response = await request(app.getHttpServer())
        .delete('/api/v1/admin/rooms/room-204')
        .set('Authorization', admin)
        .expect(409);

      expect(response.body).toMatchObject({ status: 409, errorCode: 'ROOM_IN_USE' });
      expect(response.body.detail).toContain('ROOM_IN_USE');
      expect(fhir.search).toHaveBeenCalledWith('Schedule', { actor: 'Location/room-204', _count: 1 });
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it.each([
      ['a doctor role', { roles: [ROLE] }],
      ['a service', { services: [SERVICE] }],
    ])('should refuse with 409 ROOM_IN_USE when only %s lists the room, as the usage view reports', async (_label, referrers) => {
      await boot([], referrers);

      const usage = await request(app.getHttpServer()).get(USAGE).set('Authorization', admin).expect(200);
      const response = await request(app.getHttpServer())
        .delete('/api/v1/admin/rooms/room-204')
        .set('Authorization', admin)
        .expect(409);

      expect(usage.body.inUse).toBe(true);
      expect(response.body).toMatchObject({ status: 409, errorCode: 'ROOM_IN_USE' });
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it('should delete with 204 when the usage view reports the room free', async () => {
      await boot([]);

      await request(app.getHttpServer()).delete('/api/v1/admin/rooms/room-204').set('Authorization', admin).expect(204);

      expect(committedEntries(fhir).map((entry) => `${entry.request.method} ${entry.request.url}`)).toEqual(['DELETE Location/room-204', 'POST AuditEvent']);
      expect(committedAudit(fhir)).toMatchObject({ action: 'D', entity: [auditedResource('Location', 'room-204'), expect.anything()] });
    });
  });

  describe('id validation on admin writes', () => {
    beforeEach(async () => {
      await boot([SCHEDULE]);
    });

    it('should reject a delete with 400 VALIDATION_ERROR before HAPI is called when the id carries a comma', async () => {
      const response = await request(app.getHttpServer())
        .delete('/api/v1/admin/rooms/a,b')
        .set('Authorization', admin)
        .expect(400);

      expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
      expect(fhir.read).not.toHaveBeenCalled();
      expect(fhir.search).not.toHaveBeenCalled();
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it('should reject a patch with 400 VALIDATION_ERROR before HAPI is called when the id is only dots', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/v1/admin/rooms/..')
        .set('Authorization', admin)
        .send({ name: 'Кабинет 205' })
        .expect(400);

      expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
      expect(fhir.read).not.toHaveBeenCalled();
    });
  });
});
