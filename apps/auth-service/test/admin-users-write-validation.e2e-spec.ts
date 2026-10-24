import type { INestApplication } from '@nestjs/common';
import { Role } from '@medcenter/contracts';
import request from 'supertest';

import { outboxRecords } from '../src/modules/users/__tests__/users-harness';
import { startWithAdmin, type AdminFixture } from './admin-fixture';
import { expectProblem } from './problem-assertions';
import { staffBody } from './users-helpers';

jest.mock(
  'jose',
  () => jest.requireActual<typeof import('./synthetic-token')>('./synthetic-token').joseStub,
);

type Body = Readonly<Record<string, unknown>>;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** API §2.2.1–2.2.5: the request validation, the error mapping and the response contract of the admin CRUD. */
describe('Admin users API — create and update validation', () => {
  let fixture: AdminFixture;
  let app: INestApplication;

  const api = (): ReturnType<typeof request> => request(app.getHttpServer());
  const asAdmin = (test: request.Test): request.Test =>
    test.set('authorization', fixture.adminAuthorization);
  const accounts = (): number => fixture.started.fakes.store.users.size;
  const hapiWrites = (): number => {
    const { fhir } = fixture.started.fakes;
    return [fhir.create, fhir.update, fhir.delete, fhir.batch].reduce(
      (sum, fn) => sum + fn.mock.calls.length,
      0,
    );
  };

  async function createDoctor(email: string, roleId?: string): Promise<request.Response> {
    const extra = roleId !== undefined ? { practitionerRoleId: roleId } : {};
    return asAdmin(api().post('/api/v1/admin/users')).send(staffBody(email, [Role.DOCTOR], extra));
  }

  beforeAll(async () => {
    fixture = await startWithAdmin();
    app = fixture.app;
  });

  afterAll(async () => {
    await fixture?.close();
  });

  describe('POST /api/v1/admin/users', () => {
    it('should answer 201 with the account card and no secret material when the body is valid', async () => {
      const response = await createDoctor('card-check@medcenter.by', 'role-card-check');

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        email: 'card-check@medcenter.by',
        roles: [Role.DOCTOR],
        role: Role.DOCTOR,
        isActive: true,
        patientRef: null,
        practitionerRoleRef: 'PractitionerRole/role-card-check',
        name: 'Петров Пётр',
      });
      expect(response.body.id).toMatch(UUID_V4);
      expect(JSON.stringify(response.body)).not.toMatch(
        /passwordHash|password_hash|scrypt\$|D0ctor!/,
      );
    });

    it('should create a DOCTOR without any FHIR link when no PractitionerRole is named', async () => {
      const response = await createDoctor('unlinked@medcenter.by');

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        practitionerRoleRef: null,
        patientRef: null,
        externalLinks: [],
      });
    });

    it('should create an ADMIN without provisioning a Patient or an outbox record when ADMIN is the role', async () => {
      const { fhir } = fixture.started.fakes;
      const patients = fhir.create.mock.calls.filter(([type]) => type === 'Patient').length;
      const events = outboxRecords(fhir).length;

      const response = await asAdmin(api().post('/api/v1/admin/users')).send(
        staffBody('second-admin@medcenter.by', [Role.ADMIN]),
      );

      expect(response.status).toBe(201);
      expect(fhir.create.mock.calls.filter(([type]) => type === 'Patient')).toHaveLength(patients);
      expect(outboxRecords(fhir)).toHaveLength(events);
    });

    it('should answer 409 EMAIL_TAKEN and create nothing when the email exists in another letter case', async () => {
      await createDoctor('taken@medcenter.by', 'role-taken').then((response) =>
        expect(response.status).toBe(201),
      );
      const before = accounts();

      const response = await createDoctor('TAKEN@MedCenter.by', 'role-taken-2');

      expectProblem(response, 409, 'CONFLICT');
      expect(response.body.detail).toContain('EMAIL_TAKEN');
      expect(accounts()).toBe(before);
    });

    it.each<[string, Body]>([
      ['the email is malformed', { email: 'not-an-email' }],
      ['the roles list is empty', { roles: [] }],
      ['the role is unknown', { roles: ['SUPERUSER'] }],
      ['the password is weak', { password: 'password' }],
      ['the first name is missing', { firstName: undefined }],
      ['birthDate is JSON null', { birthDate: null }],
      ['gender is JSON null', { gender: null }],
      ['practitionerRoleId is JSON null', { practitionerRoleId: null }],
      ['practitionerRoleId has a space', { practitionerRoleId: 'role 7' }],
    ])(
      'should answer 400 VALIDATION_ERROR and write nothing when %s',
      async (_label, overrides) => {
        const before = [accounts(), hapiWrites()];

        const response = await asAdmin(api().post('/api/v1/admin/users')).send(
          staffBody('invalid@medcenter.by', [Role.DOCTOR], overrides),
        );

        expectProblem(response, 400, 'VALIDATION_ERROR');
        expect([accounts(), hapiWrites()]).toEqual(before);
      },
    );

    it('should answer 400 VALIDATION_ERROR when the body is not parseable JSON', async () => {
      const response = await asAdmin(api().post('/api/v1/admin/users'))
        .set('content-type', 'application/json')
        .send('{"email": ');

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
    });

    it('should answer 400 VALIDATION_ERROR when the request has no body at all', async () => {
      expectProblem(await asAdmin(api().post('/api/v1/admin/users')), 400, 'VALIDATION_ERROR');
    });
  });

  describe('PATCH /api/v1/admin/users/{id}', () => {
    let target: { readonly id: string };

    const patch = (id: string, body: Body): request.Test =>
      asAdmin(api().patch(`/api/v1/admin/users/${id}`)).send(body);
    const card = async (id: string): Promise<Record<string, unknown>> =>
      (await asAdmin(api().get(`/api/v1/admin/users/${id}`)).expect(200)).body;

    beforeAll(async () => {
      target = (await createDoctor('patch-target@medcenter.by', 'role-patch-target')).body;
    });

    it.each<[string, Body]>([
      ['email', { email: null }],
      ['firstName', { firstName: null }],
      ['lastName', { lastName: null }],
      ['isActive', { isActive: null }],
      ['roles', { roles: null }],
      ['birthDate', { birthDate: null }],
      ['gender', { gender: null }],
    ])(
      'should answer 400 VALIDATION_ERROR and leave the account untouched when %s is JSON null',
      async (_field, body) => {
        const before = await card(target.id);

        const response = await patch(target.id, body);

        expectProblem(response, 400, 'VALIDATION_ERROR');
        expect(await card(target.id)).toEqual(before);
      },
    );

    it.each<[string, Body]>([
      ['the email is malformed', { email: 'nope' }],
      ['the first name is empty', { firstName: '' }],
      ['the roles list is empty', { roles: [] }],
      ['isActive is a string', { isActive: 'false' }],
      ['the PractitionerRole id is dots only', { practitionerRoleId: '..' }],
    ])('should answer 400 VALIDATION_ERROR when %s', async (_label, body) => {
      expectProblem(await patch(target.id, body), 400, 'VALIDATION_ERROR');
    });

    it('should answer 200 and change nothing when the body is empty', async () => {
      const before = await card(target.id);

      const response = await patch(target.id, {});

      expect(response.status).toBe(200);
      expect(await card(target.id)).toEqual(before);
    });

    it('should lower-case the email and keep the account when an administrator changes it', async () => {
      const response = await patch(target.id, { email: 'Moved.Target@MedCenter.by' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: target.id, email: 'moved.target@medcenter.by' });
    });

    it('should answer 409 EMAIL_TAKEN and keep the email when another account owns it', async () => {
      await createDoctor('owner@medcenter.by').then((response) =>
        expect(response.status).toBe(201),
      );
      const before = await card(target.id);

      const response = await patch(target.id, { email: 'OWNER@medcenter.by' });

      expectProblem(response, 409, 'CONFLICT');
      expect(response.body.detail).toContain('EMAIL_TAKEN');
      expect(await card(target.id)).toEqual(before);
    });

    it('should answer 400 when the id is not a UUID v4', async () => {
      expectProblem(await patch('not-a-uuid', { lastName: 'X' }), 400, 'VALIDATION_ERROR');
    });

    it('should answer 404 NOT_FOUND when the account does not exist', async () => {
      expectProblem(
        await patch('3f2c9a2e-8a0b-4f55-9d34-2f4a6f0b9b11', { lastName: 'X' }),
        404,
        'NOT_FOUND',
      );
    });

    it('should answer 409 SELF_LOCKOUT when an administrator drops their own ADMIN role', async () => {
      const me = (await asAdmin(api().get('/api/v1/me')).expect(200)).body;

      const response = await patch(me.id, { roles: [Role.DOCTOR] });

      expectProblem(response, 409, 'CONFLICT');
      expect(response.body.detail).toContain('SELF_LOCKOUT');
    });

    it('should answer 409 SELF_LOCKOUT when an administrator deactivates themselves through PATCH', async () => {
      const me = (await asAdmin(api().get('/api/v1/me')).expect(200)).body;

      const response = await patch(me.id, { isActive: false });

      expect(response.body.detail).toContain('SELF_LOCKOUT');
    });

    it('should answer 400 when practitionerRoleId is sent for an account that is not a DOCTOR', async () => {
      const admin = (
        await asAdmin(api().post('/api/v1/admin/users')).send(
          staffBody('peer@medcenter.by', [Role.ADMIN]),
        )
      ).body;

      expectProblem(
        await patch(admin.id, { practitionerRoleId: 'role-1' }),
        400,
        'VALIDATION_ERROR',
      );
    });
  });
});
