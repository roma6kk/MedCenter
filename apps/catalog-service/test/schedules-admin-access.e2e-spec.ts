import request from 'supertest';

import { bootCatalog, TOKENS, type CatalogHarness } from './catalog-harness';

jest.mock('jose', () => jest.requireActual<typeof import('./e2e-tokens')>('./e2e-tokens').decodeOnlyJose());

type Verb = 'get' | 'post' | 'patch' | 'delete';

interface ScheduleRoute {
  readonly label: string;
  readonly verb: Verb;
  readonly path: string;
  readonly body?: object;
}

const BASE = '/api/v1/admin/schedules';
const SCHEDULE_ROUTES: readonly ScheduleRoute[] = [
  { label: 'POST /admin/schedules', verb: 'post', path: BASE, body: { slotDurationMin: 30 } },
  { label: 'GET /admin/schedules', verb: 'get', path: BASE },
  { label: 'PATCH /admin/schedules/{id}', verb: 'patch', path: `${BASE}/sched-1`, body: { comment: 'x' } },
  { label: 'DELETE /admin/schedules/{id}', verb: 'delete', path: `${BASE}/sched-1`, body: {} },
  { label: 'POST /admin/schedules/{id}/generate', verb: 'post', path: `${BASE}/sched-1/generate`, body: { from: '2026-11-01', to: '2026-11-30' } },
  { label: 'GET /admin/schedules/{id}/slots', verb: 'get', path: `${BASE}/sched-1/slots?from=2026-11-01&to=2026-11-30` },
];

/** Schedules are admin-only (API §5.2, BR-007): no other role reaches HAPI through them. */
describe('Schedules admin access control (e2e)', () => {
  let harness: CatalogHarness;

  function call(route: ScheduleRoute, token?: string): request.Test {
    const agent = request(harness.app.getHttpServer())[route.verb](route.path);
    const authorized = token === undefined ? agent : agent.set('Authorization', token);
    return route.body === undefined ? authorized : authorized.send(route.body);
  }

  function expectFhirUntouched(): void {
    for (const interaction of [harness.fhir.read, harness.fhir.search, harness.fhir.create, harness.fhir.update, harness.fhir.delete, harness.fhir.batch]) {
      expect(interaction).not.toHaveBeenCalled();
    }
  }

  beforeEach(async () => {
    harness = await bootCatalog();
  });

  afterEach(async () => {
    await harness.app?.close();
  });

  describe.each(SCHEDULE_ROUTES)('$label', (route) => {
    it('should answer 401 UNAUTHENTICATED as problem+json when the call carries no token', async () => {
      // Act
      const response = await call(route).expect(401);

      // Assert
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ status: 401, errorCode: 'UNAUTHENTICATED' });
      expectFhirUntouched();
    });

    it.each([
      ['doctor', TOKENS.doctor],
      ['patient', TOKENS.patient],
    ])('should answer 403 FORBIDDEN_ROLE before FHIR is touched when a %s calls it', async (_role, token) => {
      // Act
      const response = await call(route, token).expect(403);

      // Assert
      expect(response.body).toMatchObject({ status: 403, errorCode: 'FORBIDDEN_ROLE' });
      expectFhirUntouched();
    });
  });

  it('should answer 400 VALIDATION_ERROR before HAPI is called when an admin patches a schedule with an unknown weekday', async () => {
    // Act
    const response = await request(harness.app.getHttpServer())
      .patch(`${BASE}/sched-1`)
      .set('Authorization', TOKENS.admin)
      .send({ windows: [{ dayOfWeek: 'XX', startTime: '09:00', endTime: '13:00' }] })
      .expect(400);

    // Assert
    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
    expect(harness.fhir.read).not.toHaveBeenCalled();
  });

  it('should answer 400 VALIDATION_ERROR before HAPI is called when an admin generates slots for a range that is not a date', async () => {
    // Act
    const response = await request(harness.app.getHttpServer())
      .post(`${BASE}/sched-1/generate`)
      .set('Authorization', TOKENS.admin)
      .send({ from: 'soon', to: 'later' })
      .expect(400);

    // Assert
    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
    expect(harness.fhir.read).not.toHaveBeenCalled();
  });
});
