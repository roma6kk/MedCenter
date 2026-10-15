import { BadGatewayException, NotFoundException, type INestApplication } from '@nestjs/common';
import { Role } from '@medcenter/contracts';
import request from 'supertest';

import { createdOf } from '../src/modules/users/__tests__/users-harness';
import { startWithAdmin, type AdminFixture } from './admin-fixture';
import { PATIENT_PASSWORD, claimsOfToken, signIn } from './auth-flow-helpers';

// `jose` is pure ESM and Jest's CJS runtime cannot load it; the signature check is stubbed and the
// claims are decoded from the token the application actually signed (see `oauth.e2e-spec.ts`).
jest.mock('jose', () => ({
  createRemoteJWKSet: () => 'mocked-jwks',
  jwtVerify: async (token: string) => {
    const segment = token.split('.')[1] ?? '';
    const payload: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    return { payload, protectedHeader: { alg: 'RS256' } };
  },
}));

const DOCTOR_PASSWORD = 'D0ctor!Passw0rd';

/** API §2.2.1–2.2.5 — the admin CRUD, over real HTTP and the real guard stack. */
describe('Admin users API (API 2.2.1–2.2.5)', () => {
  let fixture: AdminFixture;
  let app: INestApplication;

  const api = (): ReturnType<typeof request> => request(app.getHttpServer());
  const asAdmin = (test: request.Test): request.Test => test.set('authorization', fixture.adminAuthorization);

  beforeAll(async () => {
    fixture = await startWithAdmin();
    app = fixture.app;
  });

  afterAll(async () => {
    await fixture?.close();
  });

  describe('admin CRUD', () => {
    async function createDoctor(email: string, practitionerRoleId = 'role-7'): Promise<request.Response> {
      return asAdmin(api().post('/api/v1/admin/users')).send({
        email,
        firstName: 'Пётр',
        lastName: 'Петров',
        password: DOCTOR_PASSWORD,
        roles: [Role.DOCTOR],
        practitionerRoleId,
      });
    }

    it('should create a DOCTOR linked to a PractitionerRole whose token carries the fhirUser claim', async () => {
      const created = await createDoctor('doctor@medcenter.by').then((response) => {
        expect(response.status).toBe(201);
        return response.body;
      });

      const token = await signIn(app, { email: 'doctor@medcenter.by', password: DOCTOR_PASSWORD });

      expect(created.externalLinks).toEqual([
        { resourceType: 'PractitionerRole', resourceId: 'role-7', reference: 'PractitionerRole/role-7' },
      ]);
      expect(claimsOfToken(token)).toMatchObject({ role: Role.DOCTOR, fhirUser: 'PractitionerRole/role-7' });
      expect(claimsOfToken(token)['patient']).toBeUndefined();
    });

    it('should answer 409 when a second doctor is linked to the same PractitionerRole', async () => {
      await createDoctor('first@medcenter.by', 'role-shared').then((r) => expect(r.status).toBe(201));

      const second = await createDoctor('second@medcenter.by', 'role-shared');

      expect(second.status).toBe(409);
      expect(second.body.detail).toContain('PRACTITIONER_ROLE_TAKEN');
    });

    it('should answer 404 and create nothing when the PractitionerRole does not exist in HAPI', async () => {
      fixture.started.fakes.fhir.read.mockRejectedValueOnce(new NotFoundException({ errorCode: 'NOT_FOUND', message: 'PractitionerRole' }));

      const response = await createDoctor('ghost@medcenter.by', 'missing');

      expect(response.status).toBe(404);
      expect(await fixture.started.fakes.store.findByEmail('ghost@medcenter.by')).toBeNull();
    });

    it('should list users filtered by role in the paginated envelope', async () => {
      const response = await asAdmin(api().get('/api/v1/admin/users?role=DOCTOR&page=1&pageSize=1')).expect(200);

      expect(response.body.items).toHaveLength(1);
      expect(response.body.items.every((item: { roles: string[] }) => item.roles.includes(Role.DOCTOR))).toBe(true);
      expect(response.body.meta).toMatchObject({ page: 1, pageSize: 1 });
      expect(response.body.meta.totalItems).toBeGreaterThanOrEqual(2);
      expect(response.body.meta.totalPages).toBe(response.body.meta.totalItems);
    });

    it('should search by a fragment of the name or email', async () => {
      const response = await asAdmin(api().get('/api/v1/admin/users?search=DOCTOR@med')).expect(200);

      expect(response.body.items.map((item: { email: string }) => item.email)).toEqual(['doctor@medcenter.by']);
    });

    it('should answer 400 when pageSize exceeds the contract maximum', async () => {
      await asAdmin(api().get('/api/v1/admin/users?pageSize=101')).expect(400);
    });

    it('should answer 400 when the id is not a UUID', async () => {
      await asAdmin(api().get('/api/v1/admin/users/not-a-uuid')).expect(400);
    });

    it('should answer 404 when the user does not exist', async () => {
      await asAdmin(api().get('/api/v1/admin/users/3f2c9a2e-8a0b-4f55-9d34-2f4a6f0b9b11')).expect(404);
    });

    it('should return the card with its ExternalLink for GET by id', async () => {
      const created = (await createDoctor('card@medcenter.by', 'role-card')).body;

      const card = await asAdmin(api().get(`/api/v1/admin/users/${created.id}`)).expect(200);

      expect(card.body).toMatchObject({ id: created.id, practitionerRoleRef: 'PractitionerRole/role-card' });
    });

    it('should apply a PATCH of the name and write an AuditEvent', async () => {
      const created = (await createDoctor('patch@medcenter.by', 'role-patch')).body;

      const patched = await asAdmin(api().patch(`/api/v1/admin/users/${created.id}`)).send({ lastName: 'Сидоров' }).expect(200);

      expect(patched.body).toMatchObject({ lastName: 'Сидоров', name: 'Сидоров Пётр' });
      expect(createdOf(fixture.started.fakes.fhir, 'AuditEvent').at(-1)).toMatchObject({ action: 'U' });
    });

    it('should soft-deactivate on DELETE and keep the row', async () => {
      const created = (await createDoctor('leaving@medcenter.by', 'role-leaving')).body;

      const deleted = await asAdmin(api().delete(`/api/v1/admin/users/${created.id}`)).expect(200);
      const card = await asAdmin(api().get(`/api/v1/admin/users/${created.id}`)).expect(200);

      expect(deleted.body.isActive).toBe(false);
      expect(card.body).toMatchObject({ id: created.id, isActive: false });
    });

    it('should answer 409 SELF_LOCKOUT when an administrator deactivates their own account', async () => {
      const me = await asAdmin(api().get('/api/v1/me')).expect(200);

      const response = await asAdmin(api().delete(`/api/v1/admin/users/${me.body.id}`)).expect(409);

      expect(response.body.detail).toContain('SELF_LOCKOUT');
    });

    it('should stop a deactivated account from refreshing its session', async () => {
      await createDoctor('session@medcenter.by', 'role-session').then((r) => expect(r.status).toBe(201));
      const token = await signIn(app, { email: 'session@medcenter.by', password: DOCTOR_PASSWORD });
      const user = await fixture.started.fakes.store.findByEmail('session@medcenter.by');
      await asAdmin(api().delete(`/api/v1/admin/users/${user?.id ?? ''}`)).expect(200);

      const refreshed = await api()
        .post('/oauth/token')
        .type('form')
        .send({ grant_type: 'refresh_token', refresh_token: token.refresh_token, client_id: 'medcenter-web' })
        .expect(400);

      expect(refreshed.body).toMatchObject({ error: 'invalid_grant' });
    });

    it('should refuse PATIENT in a PATCH for an account that has no FHIR Patient', async () => {
      const created = (await createDoctor('nopatient@medcenter.by', 'role-np')).body;

      await asAdmin(api().patch(`/api/v1/admin/users/${created.id}`)).send({ roles: [Role.PATIENT] }).expect(400);
    });

    it('should require birthDate when an admin creates a PATIENT', async () => {
      await asAdmin(api().post('/api/v1/admin/users'))
        .send({ email: 'p@medcenter.by', firstName: 'А', lastName: 'Б', password: PATIENT_PASSWORD, roles: [Role.PATIENT] })
        .expect(400);
    });

    it.each(['..', '.'])('should answer 400 when practitionerRoleId is the dots-only id %j that URL resolution would collapse', async (id) => {
      const response = await createDoctor(`dots${id.length}@medcenter.by`, id);

      expect(response.status).toBe(400);
      expect(fixture.started.fakes.fhir.read).not.toHaveBeenCalledWith('PractitionerRole', id);
    });

    it('should reject practitionerRoleId for an account that is not a DOCTOR', async () => {
      await asAdmin(api().post('/api/v1/admin/users'))
        .send({ email: 'a@medcenter.by', firstName: 'А', lastName: 'Б', password: DOCTOR_PASSWORD, roles: [Role.ADMIN], practitionerRoleId: 'x' })
        .expect(400);
    });
  });

  describe('PATCH atomicity and PractitionerRole release', () => {
    const patch = (id: string, body: Record<string, unknown>): request.Test =>
      asAdmin(api().patch(`/api/v1/admin/users/${id}`)).send(body);

    async function createAccount(email: string, extra: Record<string, unknown>): Promise<request.Response> {
      return asAdmin(api().post('/api/v1/admin/users')).send({
        email,
        firstName: 'Пётр',
        lastName: 'Петров',
        password: DOCTOR_PASSWORD,
        ...extra,
      });
    }

    it('should answer 409 and leave roles, name and journal untouched when the PractitionerRole is taken', async () => {
      await createAccount('owner@medcenter.by', { roles: [Role.DOCTOR], practitionerRoleId: 'role-atomic' }).then((r) =>
        expect(r.status).toBe(201),
      );
      const target = (await createAccount('target@medcenter.by', { roles: [Role.ADMIN] })).body;
      const audits = createdOf(fixture.started.fakes.fhir, 'AuditEvent').length;

      const refused = await patch(target.id, { roles: [Role.DOCTOR], lastName: 'Изменён', practitionerRoleId: 'role-atomic' });
      const card = await asAdmin(api().get(`/api/v1/admin/users/${target.id}`)).expect(200);

      expect(refused.status).toBe(409);
      expect(refused.body.detail).toContain('PRACTITIONER_ROLE_TAKEN');
      expect(card.body).toMatchObject({ roles: [Role.ADMIN], lastName: 'Петров', practitionerRoleRef: null });
      expect(createdOf(fixture.started.fakes.fhir, 'AuditEvent')).toHaveLength(audits);
    });

    it('should free the PractitionerRole for the next doctor when it is patched to null', async () => {
      const first = (await createAccount('leaver@medcenter.by', { roles: [Role.DOCTOR], practitionerRoleId: 'role-free' })).body;

      const released = await patch(first.id, { practitionerRoleId: null });
      const next = await createAccount('successor@medcenter.by', { roles: [Role.DOCTOR], practitionerRoleId: 'role-free' });

      expect(released.status).toBe(200);
      expect(released.body.practitionerRoleRef).toBeNull();
      expect(next.status).toBe(201);
    });

    it('should drop the fhirUser claim from new tokens when the PractitionerRole was released', async () => {
      const doctor = (await createAccount('claimless@medcenter.by', { roles: [Role.DOCTOR], practitionerRoleId: 'role-claim' })).body;
      await patch(doctor.id, { practitionerRoleId: null }).expect(200);

      const token = await signIn(app, { email: 'claimless@medcenter.by', password: DOCTOR_PASSWORD });

      expect(claimsOfToken(token)['fhirUser']).toBeUndefined();
    });

    it('should answer 502 and keep the account as it was when HAPI refuses the Patient sync', async () => {
      const registered = await api()
        .post('/api/v1/auth/register')
        .send({ email: 'sync@medcenter.by', firstName: 'Иван', lastName: 'Иванов', password: PATIENT_PASSWORD, birthDate: '1990-05-12' })
        .expect(201);
      fixture.started.fakes.fhir.batch.mockRejectedValueOnce(new BadGatewayException({ errorCode: 'INTERNAL', message: 'FHIR server is unavailable' }));

      const refused = await patch(registered.body.id, { lastName: 'Сидоров' });
      const card = await asAdmin(api().get(`/api/v1/admin/users/${registered.body.id}`)).expect(200);

      expect(refused.status).toBe(502);
      expect(card.body.lastName).toBe('Иванов');
    });

    it('should mark admin responses Cache-Control no-store because they carry personal data', async () => {
      const response = await asAdmin(api().get('/api/v1/admin/users?pageSize=1')).expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
    });
  });
});
