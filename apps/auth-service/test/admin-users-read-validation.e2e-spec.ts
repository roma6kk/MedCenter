import type { INestApplication } from '@nestjs/common';
import { DEFAULT_PAGE_SIZE, Role } from '@medcenter/contracts';
import request from 'supertest';

import { startWithAdmin, type AdminFixture } from './admin-fixture';
import { expectProblem } from './problem-assertions';
import { staffBody } from './users-helpers';

jest.mock(
  'jose',
  () => jest.requireActual<typeof import('./synthetic-token')>('./synthetic-token').joseStub,
);

/** API §2.2.1–2.2.5: the request validation, the error mapping and the response contract of the admin CRUD. */
describe('Admin users API — delete and list validation', () => {
  let fixture: AdminFixture;
  let app: INestApplication;

  const api = (): ReturnType<typeof request> => request(app.getHttpServer());
  const asAdmin = (test: request.Test): request.Test =>
    test.set('authorization', fixture.adminAuthorization);
  const accounts = (): number => fixture.started.fakes.store.users.size;

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

  describe('DELETE /api/v1/admin/users/{id}', () => {
    const remove = (id: string): request.Test => asAdmin(api().delete(`/api/v1/admin/users/${id}`));

    it('should answer 400 when the id is not a UUID v4', async () => {
      expectProblem(await remove('42'), 400, 'VALIDATION_ERROR');
    });

    it('should answer 404 NOT_FOUND when the account does not exist', async () => {
      expectProblem(await remove('3f2c9a2e-8a0b-4f55-9d34-2f4a6f0b9b11'), 404, 'NOT_FOUND');
    });

    it('should answer 200 again and keep the account deactivated when it is deleted twice', async () => {
      const created = (await createDoctor('twice@medcenter.by', 'role-twice')).body;
      await remove(created.id).expect(200);

      const second = await remove(created.id);

      expect(second.status).toBe(200);
      expect(second.body).toMatchObject({ id: created.id, isActive: false });
    });

    it('should keep the PractitionerRole linked when the doctor is deactivated so the audit trail stays resolvable', async () => {
      const created = (await createDoctor('linked-leaver@medcenter.by', 'role-linked-leaver')).body;

      const response = await remove(created.id);

      expect(response.body).toMatchObject({
        isActive: false,
        practitionerRoleRef: 'PractitionerRole/role-linked-leaver',
      });
    });
  });

  describe('GET /api/v1/admin/users', () => {
    it.each([
      ['role=NURSE'],
      ['role='],
      ['page=0'],
      ['page=1001'],
      ['page=abc'],
      ['page=1.5'],
      ['pageSize=0'],
      ['pageSize=101'],
      [`search=${'x'.repeat(101)}`],
    ])('should answer 400 VALIDATION_ERROR when the query is %s', async (query) => {
      expectProblem(
        await asAdmin(api().get(`/api/v1/admin/users?${query}`)),
        400,
        'VALIDATION_ERROR',
      );
    });

    it('should answer the default first page with the contract meta when no query is given', async () => {
      const response = await asAdmin(api().get('/api/v1/admin/users')).expect(200);

      expect(response.body.meta).toMatchObject({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
      expect(response.body.meta.totalItems).toBe(accounts());
      expect(response.body.meta.totalPages).toBe(Math.ceil(accounts() / DEFAULT_PAGE_SIZE));
    });

    it('should answer an empty page with the real totals when the page is beyond the last one', async () => {
      const response = await asAdmin(api().get('/api/v1/admin/users?page=1000&pageSize=1')).expect(
        200,
      );

      expect(response.body.items).toEqual([]);
      expect(response.body.meta.totalItems).toBe(accounts());
    });

    it('should answer an empty list when no account matches the search', async () => {
      const response = await asAdmin(
        api().get('/api/v1/admin/users?search=no-such-person-anywhere'),
      ).expect(200);

      expect(response.body).toMatchObject({ items: [], meta: { totalItems: 0, totalPages: 0 } });
    });

    it('should never include secret material in a listed account', async () => {
      const response = await asAdmin(api().get('/api/v1/admin/users')).expect(200);

      expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|password_hash|scrypt\$/);
    });
  });
});
