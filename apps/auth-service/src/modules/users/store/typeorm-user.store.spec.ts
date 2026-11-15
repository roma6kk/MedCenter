import { Role } from '@medcenter/contracts';
import type { DataSource } from 'typeorm';

import {
  createMigratedDatabase,
  dropDatabase,
  isPostgresAvailable,
  warnPostgresUnavailable,
} from '../../../database/__tests__/pg-test-connection';
import { TypeOrmUserStore } from './typeorm-user.store';
import { DuplicateEmailError, ResourceAlreadyLinkedError, type NewUser } from './user-store';

const DATABASE = 'auth_user_store_test';
const postgresAvailable = isPostgresAvailable();

if (!postgresAvailable) {
  warnPostgresUnavailable('typeorm-user.store.spec');
}

const describePostgres = postgresAvailable ? describe : describe.skip;

function newUser(overrides: Partial<NewUser> = {}): NewUser {
  return {
    email: 'ivanov@example.by',
    passwordHash: 'scrypt$hash',
    firstName: 'Иван',
    lastName: 'Иванов',
    roles: [Role.PATIENT],
    ...overrides,
  };
}

describePostgres('TypeOrmUserStore', () => {
  let dataSource: DataSource;
  let store: TypeOrmUserStore;

  beforeAll(async () => {
    dataSource = await createMigratedDatabase(DATABASE);
    store = new TypeOrmUserStore(dataSource);
  }, 120_000);

  afterEach(async () => {
    await dataSource?.query('TRUNCATE TABLE "auth"."user" RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await dropDatabase(dataSource, DATABASE);
  }, 120_000);

  it('should persist the user with its roles when a user is created', async () => {
    const created = await store.create(newUser({ roles: [Role.DOCTOR, Role.ADMIN] }));

    const found = await store.findById(created.id);

    expect(found).toMatchObject({ email: 'ivanov@example.by', isActive: true, links: {} });
    expect([...(found?.roles ?? [])].sort()).toEqual([Role.ADMIN, Role.DOCTOR]);
  });

  it('should raise DuplicateEmailError when the email differs only by case', async () => {
    await store.create(newUser());

    await expect(store.create(newUser({ email: 'IVANOV@example.by' }))).rejects.toBeInstanceOf(
      DuplicateEmailError,
    );
  });

  it('should expose both FHIR links when the user is linked twice', async () => {
    const user = await store.create(newUser({ roles: [Role.DOCTOR] }));

    await store.link(user.id, 'Patient', 'pat-1');
    await store.link(user.id, 'PractitionerRole', 'role-1');

    expect((await store.findByEmail('ivanov@example.by'))?.links).toEqual({
      patientId: 'pat-1',
      practitionerRoleId: 'role-1',
    });
  });

  it('should replace the link when the same resource type is linked again', async () => {
    const user = await store.create(newUser({ roles: [Role.DOCTOR] }));
    await store.link(user.id, 'PractitionerRole', 'role-1');

    await store.link(user.id, 'PractitionerRole', 'role-2');

    expect((await store.findById(user.id))?.links.practitionerRoleId).toBe('role-2');
  });

  it('should raise ResourceAlreadyLinkedError when another user holds the resource', async () => {
    const first = await store.create(newUser({ roles: [Role.DOCTOR] }));
    const second = await store.create(newUser({ email: 'petrov@example.by', roles: [Role.DOCTOR] }));
    await store.link(first.id, 'PractitionerRole', 'role-1');

    await expect(store.link(second.id, 'PractitionerRole', 'role-1')).rejects.toBeInstanceOf(
      ResourceAlreadyLinkedError,
    );
  });

  it('should change scalars and replace the role set when a user is updated', async () => {
    const user = await store.create(newUser());

    const updated = await store.update(user.id, { isActive: false, roles: [Role.DOCTOR], lastName: 'Сидоров' });

    expect(updated).toMatchObject({ isActive: false, roles: [Role.DOCTOR], lastName: 'Сидоров' });
  });

  it('should link the PractitionerRole in the same transaction as the other changes', async () => {
    const user = await store.create(newUser({ roles: [Role.ADMIN] }));

    const updated = await store.update(user.id, { roles: [Role.DOCTOR], practitionerRoleId: 'role-1' });

    expect(updated).toMatchObject({ roles: [Role.DOCTOR], links: { practitionerRoleId: 'role-1' } });
  });

  it('should roll back roles and fields when the PractitionerRole belongs to another user', async () => {
    const owner = await store.create(newUser({ email: 'owner@example.by', roles: [Role.DOCTOR] }));
    await store.link(owner.id, 'PractitionerRole', 'role-1');
    const user = await store.create(newUser({ email: 'target@example.by', roles: [Role.ADMIN] }));

    await expect(
      store.update(user.id, { roles: [Role.DOCTOR], lastName: 'Изменён', practitionerRoleId: 'role-1' }),
    ).rejects.toBeInstanceOf(ResourceAlreadyLinkedError);

    expect(await store.findById(user.id)).toMatchObject({ roles: [Role.ADMIN], lastName: 'Иванов', links: {} });
  });

  it('should roll back the PractitionerRole link when the email is already taken', async () => {
    await store.create(newUser({ email: 'taken@example.by' }));
    const user = await store.create(newUser({ email: 'target@example.by', roles: [Role.DOCTOR] }));

    await expect(store.update(user.id, { email: 'taken@example.by', practitionerRoleId: 'role-1' })).rejects.toBeInstanceOf(
      DuplicateEmailError,
    );

    expect((await store.findById(user.id))?.links).toEqual({});
  });

  it('should release the PractitionerRole and let the next doctor take it when the change carries null', async () => {
    const first = await store.create(newUser({ email: 'first@example.by', roles: [Role.DOCTOR] }));
    await store.link(first.id, 'PractitionerRole', 'role-1');
    await store.link(first.id, 'Patient', 'pat-1');
    const second = await store.create(newUser({ email: 'second@example.by', roles: [Role.DOCTOR] }));

    const released = await store.update(first.id, { practitionerRoleId: null });
    await store.link(second.id, 'PractitionerRole', 'role-1');

    expect(released?.links).toEqual({ patientId: 'pat-1' });
    expect((await store.findById(second.id))?.links.practitionerRoleId).toBe('role-1');
  });

  it('should return null when the user to update does not exist', async () => {
    await expect(store.update('00000000-0000-4000-8000-000000000000', { isActive: false })).resolves.toBeNull();
  });

  it('should filter by role and search term and page the result when users are listed', async () => {
    await store.create(newUser({ email: 'a@example.by', lastName: 'Абрамов', roles: [Role.PATIENT] }));
    await store.create(newUser({ email: 'b@example.by', lastName: 'Борисов', roles: [Role.DOCTOR] }));
    await store.create(newUser({ email: 'c@example.by', lastName: 'Васильев', roles: [Role.DOCTOR] }));

    const page = await store.list({ role: Role.DOCTOR, search: 'EXAMPLE', page: 2, pageSize: 1 });

    expect(page.total).toBe(2);
    expect(page.items.map((user) => user.lastName)).toEqual(['Васильев']);
  });

  it('should find a user by the first and the last name typed together in either order', async () => {
    await store.create(newUser({ email: 'ivanova@example.by', firstName: 'Мария', lastName: 'Иванова' }));
    await store.create(newUser({ email: 'petrova@example.by', firstName: 'Мария', lastName: 'Петрова' }));

    for (const search of ['Иванова Мария', 'мария ива']) {
      const page = await store.list({ search, page: 1, pageSize: 20 });
      expect(page.items.map((user) => user.lastName)).toEqual(['Иванова']);
    }
  });

  it('should treat LIKE wildcards in the search term literally', async () => {
    await store.create(newUser({ email: 'plain@example.by' }));

    await expect(store.list({ search: '%', page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 0 });
  });

  it('should cascade roles and links when the user is removed', async () => {
    const user = await store.create(newUser());
    await store.link(user.id, 'Patient', 'pat-9');

    await store.remove(user.id);

    expect(await store.findById(user.id)).toBeNull();
    const [{ count }] = (await dataSource.query('SELECT count(*)::int AS count FROM "auth"."external_link"')) as Array<{
      count: number;
    }>;
    expect(count).toBe(0);
  });

  it('should list only closed accounts whose retention has passed, oldest first', async () => {
    const early = await store.create(newUser({ email: 'early@example.by' }));
    const late = await store.create(newUser({ email: 'late@example.by' }));
    const open = await store.create(newUser({ email: 'open@example.by' }));
    const young = await store.create(newUser({ email: 'young@example.by' }));
    await store.update(late.id, { isActive: false, closedAt: new Date('2026-01-02T00:00:00Z'), retentionUntil: new Date('2026-02-02T00:00:00Z') });
    await store.update(early.id, { isActive: false, closedAt: new Date('2026-01-01T00:00:00Z'), retentionUntil: new Date('2026-02-01T00:00:00Z') });
    await store.update(young.id, { isActive: false, closedAt: new Date('2026-03-01T00:00:00Z'), retentionUntil: new Date('2027-03-01T00:00:00Z') });

    const page = await store.listRetentionExpired({ now: new Date('2026-06-01T00:00:00Z'), page: 1, pageSize: 10 });

    expect(page.items.map((user) => user.id)).toEqual([early.id, late.id]);
    expect(page.total).toBe(2);
    expect(page.items.map((user) => user.id)).not.toContain(open.id);
  });

  it('should clear closedAt and retentionUntil when they are set to null', async () => {
    const created = await store.create(newUser());
    await store.update(created.id, { isActive: false, closedAt: new Date(), retentionUntil: new Date() });

    const reopened = await store.update(created.id, { isActive: true, closedAt: null, retentionUntil: null });

    expect(reopened?.closedAt).toBeUndefined();
    expect(reopened?.retentionUntil).toBeUndefined();
  });
});
