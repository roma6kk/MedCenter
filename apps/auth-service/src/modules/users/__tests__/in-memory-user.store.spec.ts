import { Role } from '@medcenter/contracts';

import { DuplicateEmailError, ResourceAlreadyLinkedError, type NewUser } from '../store/user-store';
import { InMemoryUserStore } from './in-memory-user.store';

function newUser(overrides: Partial<NewUser> = {}): NewUser {
  return {
    email: 'petrov@example.by',
    passwordHash: 'scrypt$hash',
    firstName: 'Пётр',
    lastName: 'Петров',
    roles: [Role.DOCTOR],
    ...overrides,
  };
}

/** The double must honour the `UserStore` contract the TypeORM adapter is held to (see `typeorm-user.store.spec.ts`). */
describe('InMemoryUserStore.update', () => {
  it('should link the PractitionerRole together with the other changes', async () => {
    const store = new InMemoryUserStore();
    const user = await store.create(newUser());

    const updated = await store.update(user.id, { lastName: 'Сидоров', practitionerRoleId: 'role-1' });

    expect(updated).toMatchObject({ lastName: 'Сидоров', links: { practitionerRoleId: 'role-1' } });
  });

  it('should change nothing when the PractitionerRole belongs to another user', async () => {
    const store = new InMemoryUserStore();
    const owner = await store.create(newUser({ email: 'owner@example.by' }));
    await store.link(owner.id, 'PractitionerRole', 'role-1');
    const user = await store.create(newUser());

    await expect(
      store.update(user.id, { roles: [Role.ADMIN], lastName: 'Сидоров', practitionerRoleId: 'role-1' }),
    ).rejects.toBeInstanceOf(ResourceAlreadyLinkedError);

    expect(await store.findById(user.id)).toMatchObject({ roles: [Role.DOCTOR], lastName: 'Петров', links: {} });
  });

  it('should change nothing when the email belongs to another user', async () => {
    const store = new InMemoryUserStore();
    await store.create(newUser({ email: 'taken@example.by' }));
    const user = await store.create(newUser());

    await expect(store.update(user.id, { email: 'TAKEN@example.by', practitionerRoleId: 'role-1' })).rejects.toBeInstanceOf(
      DuplicateEmailError,
    );

    expect(await store.findById(user.id)).toMatchObject({ email: 'petrov@example.by', links: {} });
  });

  it('should release the PractitionerRole and keep the Patient link when the change carries null', async () => {
    const store = new InMemoryUserStore();
    const user = await store.create(newUser());
    await store.link(user.id, 'Patient', 'pat-1');
    await store.link(user.id, 'PractitionerRole', 'role-1');

    const updated = await store.update(user.id, { practitionerRoleId: null });

    expect(updated?.links).toEqual({ patientId: 'pat-1' });
  });

  it('should leave the links alone when the change does not mention the PractitionerRole', async () => {
    const store = new InMemoryUserStore();
    const user = await store.create(newUser());
    await store.link(user.id, 'PractitionerRole', 'role-1');

    const updated = await store.update(user.id, { isActive: false });

    expect(updated?.links).toEqual({ practitionerRoleId: 'role-1' });
  });
});
