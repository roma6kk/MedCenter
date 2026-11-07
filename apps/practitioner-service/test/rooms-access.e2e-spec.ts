import type { INestApplication } from '@nestjs/common';
import { FhirClientError, type FhirClient } from '@medcenter/fhir';
import request from 'supertest';

import { bearer } from '@medcenter/testing';
import { bootWithFhir, createFhirStub, storedRoom, TOKENS } from './rooms-harness';

jest.mock('jose', () => jest.requireActual<typeof import('@medcenter/testing')>('@medcenter/testing').decodeOnlyJose());

type Verb = 'get' | 'post' | 'patch' | 'delete';

interface AdminRoute {
  readonly label: string;
  readonly verb: Verb;
  readonly path: string;
  readonly body?: Record<string, unknown>;
  readonly patientRefusal: 'FORBIDDEN_ROLE' | 'FORBIDDEN_SCOPE';
}

const ADMIN_ROUTES: readonly AdminRoute[] = [
  {
    label: 'POST /admin/rooms',
    verb: 'post',
    path: '/api/v1/admin/rooms',
    body: { identifier: '204-Х', name: 'Кабинет 204' },
    patientRefusal: 'FORBIDDEN_ROLE',
  },
  {
    label: 'PATCH /admin/rooms/{id}',
    verb: 'patch',
    path: '/api/v1/admin/rooms/room-204',
    body: { name: 'Кабинет 204А' },
    patientRefusal: 'FORBIDDEN_ROLE',
  },
  { label: 'DELETE /admin/rooms/{id}', verb: 'delete', path: '/api/v1/admin/rooms/room-204', patientRefusal: 'FORBIDDEN_ROLE' },
  { label: 'GET /admin/rooms/{id}/usage', verb: 'get', path: '/api/v1/admin/rooms/room-204/usage', patientRefusal: 'FORBIDDEN_SCOPE' },
];

describe('Rooms access control (e2e)', () => {
  let app: INestApplication;
  let fhir: jest.Mocked<FhirClient>;

  function call(route: AdminRoute, token?: string): request.Test {
    const agent = request(app.getHttpServer())[route.verb](route.path);
    const authorized = token === undefined ? agent : agent.set('Authorization', token);
    return route.body === undefined ? authorized : authorized.send(route.body);
  }

  function expectFhirUntouched(): void {
    for (const interaction of [fhir.read, fhir.search, fhir.create, fhir.update, fhir.delete, fhir.batch]) {
      expect(interaction).not.toHaveBeenCalled();
    }
  }

  beforeEach(async () => {
    fhir = createFhirStub();
    app = await bootWithFhir(fhir);
  });

  afterEach(async () => {
    await app?.close();
  });

  describe.each(ADMIN_ROUTES)('$label', (route) => {
    it('should answer 401 UNAUTHENTICATED when the call carries no token', async () => {
      const response = await call(route).expect(401);

      expect(response.body).toMatchObject({ status: 401, errorCode: 'UNAUTHENTICATED' });
      expectFhirUntouched();
    });

    it('should answer 403 FORBIDDEN_ROLE when a doctor calls it', async () => {
      const response = await call(route, TOKENS.doctor).expect(403);

      expect(response.body).toMatchObject({ status: 403, errorCode: 'FORBIDDEN_ROLE' });
      expectFhirUntouched();
    });

    it('should answer 403 when a patient calls it and refuse it before FHIR is touched', async () => {
      const response = await call(route, TOKENS.patient).expect(403);

      expect(response.body).toMatchObject({ status: 403, errorCode: route.patientRefusal });
      expectFhirUntouched();
    });
  });

  describe('GET /api/v1/rooms', () => {
    it('should answer 401 UNAUTHENTICATED when the call carries no token', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/rooms').expect(401);

      expect(response.body).toMatchObject({ errorCode: 'UNAUTHENTICATED' });
      expect(fhir.search).not.toHaveBeenCalled();
    });

    it('should answer 403 FORBIDDEN_SCOPE when a patient token carries only patient scopes', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/rooms').set('Authorization', TOKENS.patient).expect(403);

      expect(response.body).toMatchObject({ status: 403, errorCode: 'FORBIDDEN_SCOPE' });
      expect(fhir.search).not.toHaveBeenCalled();
    });

    it('should answer 403 FORBIDDEN_SCOPE when a staff token lacks user/*.read', async () => {
      const writeOnly = bearer({ role: 'DOCTOR', scope: 'user/*.write launch', fhirUser: 'PractitionerRole/role-7' });

      const response = await request(app.getHttpServer()).get('/api/v1/rooms').set('Authorization', writeOnly).expect(403);

      expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_SCOPE' });
      expect(fhir.search).not.toHaveBeenCalled();
    });

    it.each([
      ['admin', TOKENS.admin],
      ['doctor', TOKENS.doctor],
    ])('should answer 200 with the page envelope when a %s holds user/*.read', async (_role, token) => {
      fhir.search.mockResolvedValue({ entry: [{ resource: storedRoom() }] });

      const response = await request(app.getHttpServer()).get('/api/v1/rooms').set('Authorization', token).expect(200);

      expect(response.body).toEqual({
        items: [{ id: 'room-204', identifier: '204-Х', name: 'Кабинет 204', description: 'Окна во двор', isActive: true }],
        meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      });
    });

    it('should answer 502 INTERNAL without the HAPI address when the FHIR server is unreachable', async () => {
      fhir.search.mockRejectedValue(new FhirClientError('GET', 'http://hapi:8080/fhir/Location', undefined, undefined));

      const response = await request(app.getHttpServer()).get('/api/v1/rooms').set('Authorization', TOKENS.admin).expect(502);

      expect(response.body).toMatchObject({ status: 502, errorCode: 'INTERNAL' });
      expect(JSON.stringify(response.body)).not.toContain('hapi:8080');
    });
  });

  describe('DELETE /api/v1/admin/rooms/{id}', () => {
    it('should answer 404 NOT_FOUND and delete nothing when the room does not exist', async () => {
      fhir.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi:8080/fhir/Location/room-204', 404, '{}'));

      const response = await call(ADMIN_ROUTES[2] as AdminRoute, TOKENS.admin).expect(404);

      expect(response.body).toMatchObject({ status: 404, errorCode: 'NOT_FOUND' });
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it('should answer 409 ROOM_IN_USE when HAPI itself refuses the delete on referential integrity', async () => {
      fhir.read.mockResolvedValue(storedRoom());
      fhir.batch.mockRejectedValue(new FhirClientError('POST', 'http://hapi:8080/fhir', 409, '{}'));

      const response = await call(ADMIN_ROUTES[2] as AdminRoute, TOKENS.admin).expect(409);

      expect(response.body).toMatchObject({ status: 409, errorCode: 'ROOM_IN_USE' });
    });
  });
});
