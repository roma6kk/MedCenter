import type { FhirResource } from '@medcenter/fhir';
import request from 'supertest';

import { AuditSyncService } from '../src/modules/audit/audit-sync.service';
import { startAppHarness, type AppHarness } from './app-harness';

const DAY_MS = 86_400_000;

/** Exactly the shape appointment-service / encounter-service write (ADR-014), after HAPI assigned ids. */
function auditEvent(params: {
  readonly id: string;
  readonly recorded: string;
  readonly actor: string;
  readonly subtype: 'create' | 'update';
  readonly entity: ReadonlyArray<string>;
  readonly observer: string;
}): FhirResource {
  return {
    resourceType: 'AuditEvent',
    id: params.id,
    meta: { lastUpdated: params.recorded },
    type: { system: 'http://terminology.hl7.org/CodeSystem/audit-event-type', code: 'rest' },
    subtype: [{ system: 'http://hl7.org/fhir/restful-interaction', code: params.subtype }],
    action: params.subtype === 'create' ? 'C' : 'U',
    recorded: params.recorded,
    outcome: '0',
    agent: [{ who: { identifier: { value: params.actor } }, requestor: true }],
    source: { observer: { display: params.observer } },
    entity: params.entity.map((reference) => ({ what: { reference } })),
  };
}

const BOOKING = auditEvent({
  id: 'ae-1',
  recorded: '2026-10-08T10:00:00.000Z',
  actor: 'patient-user-1',
  subtype: 'create',
  entity: ['Appointment/apt-1'],
  observer: 'appointment-service',
});

const CANCELLATION = auditEvent({
  id: 'ae-2',
  recorded: '2026-10-09T08:30:00.000Z',
  actor: 'admin-user-7',
  subtype: 'update',
  entity: ['Appointment/apt-1'],
  observer: 'appointment-service',
});

const COMPLETION = auditEvent({
  id: 'ae-3',
  recorded: '2026-10-10T12:00:00.000Z',
  actor: 'doctor-user-3',
  subtype: 'update',
  entity: ['Encounter/enc-1', 'Condition/cond-1', 'Patient/pat-1'],
  observer: 'encounter-service',
});

const OCTOBER = 'from=2026-10-01&to=2026-10-31';

describe('GET /api/v1/admin/audit (API §9.4, FR-021) over a mocked HAPI', () => {
  let harness: AppHarness;

  /** `token: null` sends no Authorization header (an explicit `undefined` would pick the default). */
  function get(path: string, token: string | null = harness.adminToken()): request.Test {
    const call = request(harness.app.getHttpServer()).get(path);
    return token === null ? call : call.set('Authorization', `Bearer ${token}`);
  }

  async function syncFromHapi(resources: ReadonlyArray<FhirResource>): Promise<void> {
    harness.fhir.search.mockImplementation(async (_type, params) =>
      params?.['_offset'] === 0 ? { entry: resources.map((resource) => ({ resource })) } : { entry: [] },
    );
    await harness.get(AuditSyncService).syncOnce();
  }

  beforeAll(async () => {
    harness = await startAppHarness();
    await syncFromHapi([BOOKING, CANCELLATION, COMPLETION]);
  });

  afterAll(async () => {
    await harness?.close();
  });

  it('should return the journal newest first in the pagination envelope when an admin asks for a period', async () => {
    const response = await get(`/api/v1/admin/audit?${OCTOBER}`).expect(200);

    expect(response.body.meta).toEqual({ page: 1, pageSize: 20, totalItems: 3, totalPages: 1 });
    expect(response.body.items[0]).toEqual({
      id: 'ae-3',
      occurredAt: '2026-10-10T12:00:00.000Z',
      userId: 'doctor-user-3',
      action: 'update',
      resourceType: 'Encounter',
      resourceId: 'enc-1',
      requestId: '',
    });
    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual(['ae-3', 'ae-2', 'ae-1']);
  });

  it('should filter by the acting user when userId is given', async () => {
    const response = await get(`/api/v1/admin/audit?${OCTOBER}&userId=admin-user-7`).expect(200);

    expect(response.body.items).toEqual([expect.objectContaining({ id: 'ae-2', action: 'update', resourceId: 'apt-1' })]);
  });

  it('should filter by resource type when entity is a bare type', async () => {
    const response = await get(`/api/v1/admin/audit?${OCTOBER}&entity=Appointment`).expect(200);

    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual(['ae-2', 'ae-1']);
  });

  it('should filter by one resource when entity is a Type/id reference', async () => {
    const response = await get(`/api/v1/admin/audit?${OCTOBER}&entity=Encounter/enc-1`).expect(200);

    expect(response.body.meta.totalItems).toBe(1);
  });

  it('should page through the journal when page and pageSize are given', async () => {
    const response = await get(`/api/v1/admin/audit?${OCTOBER}&page=2&pageSize=2`).expect(200);

    expect(response.body.meta).toEqual({ page: 2, pageSize: 2, totalItems: 3, totalPages: 2 });
    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual(['ae-1']);
  });

  it('should not duplicate rows when the same AuditEvents are pulled from HAPI again', async () => {
    await syncFromHapi([BOOKING, CANCELLATION, COMPLETION]);

    const response = await get(`/api/v1/admin/audit?${OCTOBER}`).expect(200);

    expect(response.body.meta.totalItems).toBe(3);
  });

  it('should default to the last 30 days when the admin table sends only ?page=1', async () => {
    const recent = new Date(Date.now() - DAY_MS).toISOString();
    await syncFromHapi([{ ...BOOKING, id: 'ae-recent', recorded: recent, meta: { lastUpdated: recent } }]);

    const response = await get('/api/v1/admin/audit?page=1').expect(200);

    const items: ReadonlyArray<{ id: string; occurredAt: string }> = response.body.items;
    expect(items.map((item) => item.id)).toContain('ae-recent');
    expect(items.every((item) => Date.parse(item.occurredAt) > Date.now() - 31 * DAY_MS)).toBe(true);
  });

  it('should keep the journal moving when HAPI holds an AuditEvent with oversized fields', async () => {
    const oversized: FhirResource = {
      ...BOOKING,
      id: 'ae-long',
      recorded: '2026-10-20T10:00:00.000Z',
      meta: { lastUpdated: '2026-10-20T10:00:00.000Z' },
      agent: [{ who: { identifier: { value: 'u'.repeat(300) } }, requestor: true }],
      source: { observer: { display: 's'.repeat(300) } },
    };
    const newer: FhirResource = {
      ...BOOKING,
      id: 'ae-after-long',
      recorded: '2026-10-21T10:00:00.000Z',
      meta: { lastUpdated: '2026-10-21T10:00:00.000Z' },
    };

    await syncFromHapi([oversized, newer]);

    const response = await get('/api/v1/admin/audit?from=2026-10-20&to=2026-10-21').expect(200);
    const items: ReadonlyArray<{ id: string; userId: string }> = response.body.items;
    expect(items.map((item) => item.id)).toEqual(['ae-after-long', 'ae-long']);
    expect(items[1]?.userId).toHaveLength(128);
  });

  it('should show an auth-service account change as AuthUser/{id} when the event touches no FHIR resource', async () => {
    const accountChange: FhirResource = {
      ...BOOKING,
      id: 'ae-account',
      recorded: '2026-10-22T09:00:00.000Z',
      meta: { lastUpdated: '2026-10-22T09:00:00.000Z' },
      source: { observer: { display: 'auth-service' } },
      entity: [
        {
          what: { identifier: { system: 'https://api.medcenter.by/sid/auth-user', value: 'user-42' } },
          type: { code: '2', display: 'System Object' },
          name: 'auth.user',
        },
      ],
    };

    await syncFromHapi([accountChange]);

    const response = await get('/api/v1/admin/audit?from=2026-10-22&to=2026-10-22&entity=AuthUser').expect(200);
    expect(response.body.items).toEqual([expect.objectContaining({ id: 'ae-account', resourceType: 'AuthUser', resourceId: 'user-42' })]);
  });

  it('should reject a period longer than 366 days with 400 VALIDATION_ERROR when from and to are too far apart', async () => {
    const response = await get('/api/v1/admin/audit?from=2025-01-01&to=2026-10-31').expect(400);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({ status: 400, errorCode: 'VALIDATION_ERROR' });
  });

  it('should reject an inverted period with 400 VALIDATION_ERROR when from is after to', async () => {
    const response = await get('/api/v1/admin/audit?from=2026-10-31&to=2026-10-01').expect(400);

    expect(response.body.errorCode).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['an entity that is not a resource reference', 'entity=appointment;drop'],
    ['a pageSize above 100', 'pageSize=101'],
    ['a malformed date', 'from=31.10.2026'],
    ['a month instead of a date', 'from=2026-10&to=2026-10'],
  ])('should reject the request with 400 VALIDATION_ERROR when the query carries %s', async (_case, query) => {
    const response = await get(`/api/v1/admin/audit?${query}`).expect(400);

    expect(response.body.errorCode).toBe('VALIDATION_ERROR');
  });

  it('should refuse a doctor with 403 FORBIDDEN_ROLE when the journal is admin-only (BR-007)', async () => {
    const doctor = harness.issuer.sign({
      sub: 'doctor-user-3',
      role: 'DOCTOR',
      scope: 'user/*.read user/*.write launch',
      fhirUser: 'PractitionerRole/role-1',
    });

    const response = await get(`/api/v1/admin/audit?${OCTOBER}`, doctor).expect(403);

    expect(response.body.errorCode).toBe('FORBIDDEN_ROLE');
  });

  it('should refuse a patient-scoped token with 403 FORBIDDEN_SCOPE when the journal needs user scopes', async () => {
    const patient = harness.issuer.sign({
      sub: 'patient-user-1',
      role: 'PATIENT',
      scope: 'patient/*.read patient/*.write launch',
      patient: 'pat-1',
      fhirUser: 'Patient/pat-1',
    });

    const response = await get(`/api/v1/admin/audit?${OCTOBER}`, patient).expect(403);

    expect(response.body.errorCode).toBe('FORBIDDEN_SCOPE');
  });

  it('should answer 401 UNAUTHENTICATED when no bearer token is sent', async () => {
    const response = await get(`/api/v1/admin/audit?${OCTOBER}`, null).expect(401);

    expect(response.body.errorCode).toBe('UNAUTHENTICATED');
  });
});
