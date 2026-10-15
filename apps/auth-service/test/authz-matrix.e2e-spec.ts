import type { INestApplication } from '@nestjs/common';
import { Role } from '@medcenter/contracts';
import request from 'supertest';

import { startWithAdmin, type AdminFixture } from './admin-fixture';
import { PATIENT_PASSWORD, bearer, signIn } from './auth-flow-helpers';
import { PROTECTED_ENDPOINTS, type ProtectedEndpoint } from './endpoint-catalog';
import { rawBearer, syntheticBearer } from './synthetic-token';

jest.mock(
  'jose',
  () => jest.requireActual<typeof import('./synthetic-token')>('./synthetic-token').joseStub,
);

const DOCTOR = { email: 'matrix-doctor@medcenter.by', password: 'D0ctor!Passw0rd' } as const;
const PATIENT = { email: 'matrix-patient@example.by', password: PATIENT_PASSWORD } as const;

const EXPANSION = { resourceType: 'ValueSet', expansion: { total: 0, contains: [] } };
const VALIDATION = {
  resourceType: 'Parameters',
  parameter: [{ name: 'result', valueBoolean: true }],
};

type Caller = 'administrator' | 'doctor' | 'patient';

/** Who may call the endpoint: the role pin narrows it to ADMIN, the scope pin excludes the PATIENT token. */
function allowedCallers(endpoint: ProtectedEndpoint): ReadonlyArray<Caller> {
  if (endpoint.role !== null) {
    return ['administrator'];
  }
  return endpoint.scope === null
    ? ['administrator', 'doctor', 'patient']
    : ['administrator', 'doctor'];
}

/**
 * Perimeter matrix over every protected route of the service: anonymous, malformed credential,
 * wrong scope, wrong role, and the one caller the handler is meant for (ADR-009, API §0 scope
 * matrix). Refused calls carry a *valid* request, so a guard that failed open would change state;
 * each refusal asserts that neither `auth` nor HAPI was written.
 */
describe('Authorization matrix of the protected endpoints', () => {
  let fixture: AdminFixture;
  let app: INestApplication;
  let authorization: Record<Caller, string>;

  const writes = (): number => {
    const { fhir, store } = fixture.started.fakes;
    return (
      store.users.size +
      [fhir.create, fhir.update, fhir.delete, fhir.batch].reduce(
        (n, fn) => n + fn.mock.calls.length,
        0,
      )
    );
  };

  function call(endpoint: ProtectedEndpoint, header?: string, probe = false): request.Test {
    const path = (probe ? endpoint.reached.path : undefined) ?? endpoint.path;
    const body = probe ? (endpoint.reached.body ?? endpoint.body) : endpoint.body;
    const test = request(app.getHttpServer())[endpoint.method](path);
    return (header === undefined ? test : test.set('authorization', header)).send(body);
  }

  beforeAll(async () => {
    fixture = await startWithAdmin();
    app = fixture.app;
    await request(app.getHttpServer())
      .post('/api/v1/admin/users')
      .set('authorization', fixture.adminAuthorization)
      .send({ ...DOCTOR, firstName: 'Пётр', lastName: 'Петров', roles: [Role.DOCTOR] })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ ...PATIENT, firstName: 'Иван', lastName: 'Иванов', birthDate: '1990-05-12' })
      .expect(201);
    authorization = {
      administrator: fixture.adminAuthorization,
      doctor: bearer(await signIn(app, DOCTOR)),
      patient: bearer(await signIn(app, PATIENT)),
    };
  });

  afterAll(async () => {
    await fixture?.close();
  });

  beforeEach(() => {
    const { fhir } = fixture.started.fakes;
    fhir.search.mockResolvedValue({ entry: [] });
    fhir.operation.mockImplementation(async (_type, operation) =>
      operation === '$validate-code' ? VALIDATION : EXPANSION,
    );
  });

  describe.each(PROTECTED_ENDPOINTS)('$name', (endpoint) => {
    it('should answer 401 UNAUTHENTICATED as problem+json when no token is presented', async () => {
      const before = writes();

      const response = await call(endpoint);

      expect(response.status).toBe(401);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ status: 401, errorCode: 'UNAUTHENTICATED' });
      expect(writes()).toBe(before);
    });

    it('should answer 401 UNAUTHENTICATED when the Authorization header is not a Bearer credential', async () => {
      const response = await call(endpoint, 'Basic YWRtaW46c2VjcmV0');

      expect(response.body).toMatchObject({ status: 401, errorCode: 'UNAUTHENTICATED' });
    });

    it('should answer 401 UNAUTHENTICATED when the token lacks the jti claim', async () => {
      const incomplete = rawBearer({
        sub: 'someone',
        scope: 'user/*.read user/*.write',
        role: Role.ADMIN,
      });

      const response = await call(endpoint, incomplete);

      expect(response.body).toMatchObject({ status: 401, errorCode: 'UNAUTHENTICATED' });
    });

    if (endpoint.scope !== null) {
      it('should answer 403 FORBIDDEN_SCOPE and change nothing when a patient token calls it', async () => {
        const before = writes();

        const response = await call(endpoint, authorization.patient);

        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_SCOPE' });
        expect(writes()).toBe(before);
      });

      it(`should answer 403 FORBIDDEN_SCOPE and change nothing when an administrator token lacks ${endpoint.scope}`, async () => {
        const held =
          endpoint.scope === 'user/*.read' ? 'launch user/*.write' : 'launch user/*.read';
        const before = writes();

        const response = await call(
          endpoint,
          syntheticBearer({ sub: 'admin-x', role: Role.ADMIN, scope: held }),
        );

        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_SCOPE' });
        expect(writes()).toBe(before);
      });
    }

    if (endpoint.role !== null) {
      it('should answer 403 FORBIDDEN_ROLE and change nothing when a doctor, who holds the user scopes, calls it', async () => {
        const before = writes();

        const response = await call(endpoint, authorization.doctor);

        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_ROLE' });
        expect(writes()).toBe(before);
      });

      it('should answer 403 FORBIDDEN_ROLE when a PATIENT role token carries the user scopes', async () => {
        const forged = syntheticBearer({
          sub: 'p-1',
          role: Role.PATIENT,
          scope: 'launch user/*.read user/*.write',
          patient: 'p-1',
        });

        const response = await call(endpoint, forged);

        expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_ROLE' });
      });
    }

    it.each(allowedCallers(endpoint))(
      'should reach the handler when the %s calls it',
      async (caller) => {
        const response = await call(endpoint, authorization[caller], true);

        expect(response.status).toBe(endpoint.reached.status);
      },
    );
  });
});
