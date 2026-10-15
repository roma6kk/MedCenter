import type { INestApplication } from '@nestjs/common';
import { FhirClientError, type FhirClient } from '@medcenter/fhir';
import request from 'supertest';

import { bearer } from './e2e-tokens';
import { bootWithFhir, createFhirStub, storedRoom, TOKENS } from './rooms-harness';

jest.mock('jose', () => jest.requireActual<typeof import('./e2e-tokens')>('./e2e-tokens').decodeOnlyJose());

type Verb = 'get' | 'post' | 'patch' | 'delete';

interface AdminRoute {
  readonly label: string;
  readonly verb: Verb;
  readonly path: string;
  readonly body?: Record<string, unknown>;
  /** The guard that refuses a patient token first: scopes run before roles (ADR-009), and only reads demand a scope. */
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

/**
 * Who may call the room API (API §4.3-§4.7): reads need `user/*.read`, every
 * admin route needs the `ADMIN` role. The FHIR client must stay untouched
 * whenever the guard stack refuses a call.
 */
describe('Rooms access control (e2e)', () => {
  let app: INestApplication;
  let fhir: jest.Mocked<FhirClient>;

  function call(route: AdminRoute, token?: string): request.Test {
    const agent = request(app.getHttpServer())[route.verb](route.path);
    const authorized = token === undefined ? agent : agent.set('Authorization', token);
    return route.body === undefined ? authorized : authorized.send(route.body);
  }

  function expectFhirUntouched(): void {
    for (const interaction of [fhir.read, fhir.search, fhir.create, fhir.update, fhir.delete]) {
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
      // Act
      const response = await call(route).expect(401);

      // Assert
      expect(response.body).toMatchObject({ status: 401, errorCode: 'UNAUTHENTICATED' });
      expectFhirUntouched();
    });

    it('should answer 403 FORBIDDEN_ROLE when a doctor calls it', async () => {
      // Act
      const response = await call(route, TOKENS.doctor).expect(403);

      // Assert
      expect(response.body).toMatchObject({ status: 403, errorCode: 'FORBIDDEN_ROLE' });
      expectFhirUntouched();
    });

    it('should answer 403 when a patient calls it and refuse it before FHIR is touched', async () => {
      // Act
      const response = await call(route, TOKENS.patient).expect(403);

      // Assert
      expect(response.body).toMatchObject({ status: 403, errorCode: route.patientRefusal });
      expectFhirUntouched();
    });
  });

  describe('GET /api/v1/rooms', () => {
    it('should answer 401 UNAUTHENTICATED when the call carries no token', async () => {
      // Act
      const response = await request(app.getHttpServer()).get('/api/v1/rooms').expect(401);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'UNAUTHENTICATED' });
      expect(fhir.search).not.toHaveBeenCalled();
    });

    it('should answer 403 FORBIDDEN_SCOPE when a patient token carries only patient scopes', async () => {
      // Act — API §4.3 asks for `user/*.read`; a patient/* token must not enumerate the clinic's rooms.
      const response = await request(app.getHttpServer()).get('/api/v1/rooms').set('Authorization', TOKENS.patient).expect(403);

      // Assert
      expect(response.body).toMatchObject({ status: 403, errorCode: 'FORBIDDEN_SCOPE' });
      expect(fhir.search).not.toHaveBeenCalled();
    });

    it('should answer 403 FORBIDDEN_SCOPE when a staff token lacks user/*.read', async () => {
      // Arrange
      const writeOnly = bearer({ role: 'DOCTOR', scope: 'user/*.write launch', fhirUser: 'PractitionerRole/role-7' });

      // Act
      const response = await request(app.getHttpServer()).get('/api/v1/rooms').set('Authorization', writeOnly).expect(403);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_SCOPE' });
      expect(fhir.search).not.toHaveBeenCalled();
    });

    it.each([
      ['admin', TOKENS.admin],
      ['doctor', TOKENS.doctor],
    ])('should answer 200 with the page envelope when a %s holds user/*.read', async (_role, token) => {
      // Arrange
      fhir.search.mockResolvedValue({ entry: [{ resource: storedRoom() }] });

      // Act
      const response = await request(app.getHttpServer()).get('/api/v1/rooms').set('Authorization', token).expect(200);

      // Assert
      expect(response.body).toEqual({
        items: [{ id: 'room-204', identifier: '204-Х', name: 'Кабинет 204', description: 'Окна во двор', isActive: true }],
        meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      });
    });

    it('should answer 502 INTERNAL without the HAPI address when the FHIR server is unreachable', async () => {
      // Arrange
      fhir.search.mockRejectedValue(new FhirClientError('GET', 'http://hapi:8080/fhir/Location', undefined, undefined));

      // Act
      const response = await request(app.getHttpServer()).get('/api/v1/rooms').set('Authorization', TOKENS.admin).expect(502);

      // Assert
      expect(response.body).toMatchObject({ status: 502, errorCode: 'INTERNAL' });
      expect(JSON.stringify(response.body)).not.toContain('hapi:8080');
    });
  });

  describe('DELETE /api/v1/admin/rooms/{id}', () => {
    it('should answer 404 NOT_FOUND and delete nothing when the room does not exist', async () => {
      // Arrange
      fhir.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi:8080/fhir/Location/room-204', 404, '{}'));

      // Act
      const response = await call(ADMIN_ROUTES[2] as AdminRoute, TOKENS.admin).expect(404);

      // Assert
      expect(response.body).toMatchObject({ status: 404, errorCode: 'NOT_FOUND' });
      expect(fhir.delete).not.toHaveBeenCalled();
    });

    it('should answer 409 CONFLICT when HAPI itself refuses the delete on referential integrity', async () => {
      // Arrange — a schedule created between the usage check and the delete: HAPI's own 409, not ROOM_IN_USE.
      fhir.read.mockResolvedValue(storedRoom());
      fhir.delete.mockRejectedValue(new FhirClientError('DELETE', 'http://hapi:8080/fhir/Location/room-204', 409, '{}'));

      // Act
      const response = await call(ADMIN_ROUTES[2] as AdminRoute, TOKENS.admin).expect(409);

      // Assert
      expect(response.body).toMatchObject({ status: 409, errorCode: 'CONFLICT' });
    });
  });
});
