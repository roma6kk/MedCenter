import type { INestApplication } from '@nestjs/common';
import { Role } from '@medcenter/contracts';
import { FhirClientError } from '@medcenter/fhir';
import request from 'supertest';

import { createdOf } from '../src/modules/users/__tests__/users-harness';
import { startWithAdmin, type AdminFixture } from './admin-fixture';
import { AUTH_USER_SYSTEM, REGISTRATION, staffBody } from './users-helpers';

jest.mock(
  'jose',
  () => jest.requireActual<typeof import('./synthetic-token')>('./synthetic-token').joseStub,
);

const HAPI_URL = 'http://hapi.internal:8080/fhir';
const UNKNOWN_ID = '3f2c9a2e-8a0b-4f55-9d34-2f4a6f0b9b11';
const OBJECT_ROLE = {
  system: 'http://terminology.hl7.org/CodeSystem/object-role',
  code: '1',
  display: 'Patient',
};

/** FR-021, ADR-014: every mutation of an account writes an `AuditEvent`, and a refused or unaudited request behaves as documented. */
describe('Users API — AuditEvent and PractitionerRole interactions with HAPI', () => {
  let fixture: AdminFixture;
  let app: INestApplication;
  let adminId: string;

  const api = (): ReturnType<typeof request> => request(app.getHttpServer());
  const asAdmin = (test: request.Test): request.Test =>
    test.set('authorization', fixture.adminAuthorization).set('x-request-id', 'trace-audit-1');
  const fakes = (): AdminFixture['started']['fakes'] => fixture.started.fakes;
  const lastAudit = (): Record<string, unknown> =>
    createdOf(fakes().fhir, 'AuditEvent').at(-1) ?? {};
  const create = (email: string, roles: Role[], extra = {}): request.Test =>
    asAdmin(api().post('/api/v1/admin/users')).send(staffBody(email, roles, extra));

  beforeAll(async () => {
    fixture = await startWithAdmin();
    app = fixture.app;
    adminId = (await asAdmin(api().get('/api/v1/me')).expect(200)).body.id;
  });

  afterAll(async () => {
    await fixture?.close();
  });

  describe('AuditEvent of every mutation', () => {
    it('should write a create AuditEvent under the administrator with the account and the request id when an account is created', async () => {
      const created = (
        await create('audited@medcenter.by', [Role.DOCTOR], {
          practitionerRoleId: 'role-audited',
        }).expect(201)
      ).body;

      expect(lastAudit()).toMatchObject({
        resourceType: 'AuditEvent',
        type: { code: 'rest' },
        subtype: [{ code: 'create' }],
        action: 'C',
        outcome: '0',
        agent: [{ who: { identifier: { value: adminId } }, requestor: true }],
        source: { observer: { display: 'auth-service' } },
        entity: [
          { what: { reference: 'PractitionerRole/role-audited' } },
          {
            what: { identifier: { system: AUTH_USER_SYSTEM, value: created.id } },
            name: 'auth.user',
            description: 'user.created',
          },
          { what: { identifier: { value: 'trace-audit-1' } }, type: { code: 'XrequestId' } },
        ],
      });
    });

    it('should mark the Patient entity with the patient object role when a patient account is changed', async () => {
      const registered = (
        await api()
          .post('/api/v1/auth/register')
          .send({ ...REGISTRATION, email: 'audit-patient@example.by' })
          .expect(201)
      ).body;

      await asAdmin(api().patch(`/api/v1/admin/users/${registered.id}`))
        .send({ isActive: false })
        .expect(200);

      expect(lastAudit()).toMatchObject({
        action: 'U',
        entity: expect.arrayContaining([
          { what: { reference: registered.patientRef }, role: OBJECT_ROLE },
        ]),
      });
    });

    it('should name the event user.deactivated when an account is deleted', async () => {
      const created = (await create('to-delete@medcenter.by', [Role.ADMIN]).expect(201)).body;

      await asAdmin(api().delete(`/api/v1/admin/users/${created.id}`)).expect(200);

      expect(lastAudit()).toMatchObject({
        action: 'U',
        subtype: [{ code: 'update' }],
        entity: expect.arrayContaining([
          expect.objectContaining({ description: 'user.deactivated' }),
        ]),
      });
    });

    it('should write no AuditEvent when the request is refused before any change', async () => {
      const audits = createdOf(fakes().fhir, 'AuditEvent').length;

      await asAdmin(api().post('/api/v1/admin/users')).send({ email: 'bad' }).expect(400);
      await asAdmin(api().patch(`/api/v1/admin/users/${UNKNOWN_ID}`))
        .send({ lastName: 'X' })
        .expect(404);

      expect(createdOf(fakes().fhir, 'AuditEvent')).toHaveLength(audits);
    });

    it('should still answer 200 and keep the deactivation when the AuditEvent cannot be written', async () => {
      const created = (await create('unaudited@medcenter.by', [Role.ADMIN]).expect(201)).body;
      fakes().fhir.create.mockRejectedValueOnce(new FhirClientError('POST', HAPI_URL, 503));

      const response = await asAdmin(api().delete(`/api/v1/admin/users/${created.id}`));

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: created.id, isActive: false });
    });
  });

  describe('PractitionerRole of a doctor', () => {
    it('should read the PractitionerRole in HAPI before it links a doctor when an account is created', async () => {
      await create('role-read@medcenter.by', [Role.DOCTOR], {
        practitionerRoleId: 'role-read',
      }).expect(201);

      expect(fakes().fhir.read).toHaveBeenCalledWith('PractitionerRole', 'role-read');
    });

    it('should answer 404 and keep the link when a PATCH names a PractitionerRole HAPI does not hold', async () => {
      const doctor = (
        await create('relink@medcenter.by', [Role.DOCTOR], {
          practitionerRoleId: 'role-old',
        }).expect(201)
      ).body;
      fakes().fhir.read.mockRejectedValueOnce(new FhirClientError('GET', HAPI_URL, 404));

      const response = await asAdmin(api().patch(`/api/v1/admin/users/${doctor.id}`)).send({
        practitionerRoleId: 'role-missing',
      });

      const card = await asAdmin(api().get(`/api/v1/admin/users/${doctor.id}`)).expect(200);
      expect(response.status).toBe(404);
      expect(card.body.practitionerRoleRef).toBe('PractitionerRole/role-old');
    });

    it('should answer 502 and create no account when HAPI is unavailable while the PractitionerRole is checked', async () => {
      const before = fakes().store.users.size;
      fakes().fhir.read.mockRejectedValueOnce(new FhirClientError('GET', HAPI_URL, 503));

      const response = await create('role-down@medcenter.by', [Role.DOCTOR], {
        practitionerRoleId: 'role-down',
      });

      expect(response.status).toBe(502);
      expect(fakes().store.users.size).toBe(before);
    });
  });
});
