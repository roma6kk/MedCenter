import { Role } from '@medcenter/contracts';

import { BootstrapAdminService } from './bootstrap-admin.service';
import { CredentialsService } from './credentials.service';
import { UserIdentityResolver } from './user-identity.resolver';
import { createdOf, createUsersHarness, type UsersHarness } from './__tests__/users-harness';

const ADMIN = { sub: 'admin-1' } as const;

async function seedDoctor(harness: UsersHarness, practitionerRoleId?: string): Promise<string> {
  const user = await harness.users.create(
    {
      email: 'Petrov@Example.by',
      firstName: 'Пётр',
      lastName: 'Петров',
      password: 'Str0ng!Pass',
      roles: [Role.DOCTOR],
      ...(practitionerRoleId !== undefined ? { practitionerRoleId } : {}),
    },
    ADMIN,
  );
  return user.id;
}

describe('CredentialsService', () => {
  it('should return the user id when the email (any case) and password match an active account', async () => {
    const harness = createUsersHarness();
    const userId = await seedDoctor(harness);
    const credentials = new CredentialsService(harness.store, harness.hasher);

    await expect(credentials.verify(' PETROV@example.by', 'Str0ng!Pass')).resolves.toBe(userId);
  });

  it('should return null when the password is wrong', async () => {
    const harness = createUsersHarness();
    await seedDoctor(harness);
    const credentials = new CredentialsService(harness.store, harness.hasher);

    await expect(credentials.verify('petrov@example.by', 'Wr0ng!Pass')).resolves.toBeNull();
  });

  it('should return null and still spend the scrypt cost when the email is unknown', async () => {
    const harness = createUsersHarness();
    const dummy = jest.spyOn(harness.hasher, 'verifyAgainstDummy');
    const credentials = new CredentialsService(harness.store, harness.hasher);

    await expect(credentials.verify('nobody@example.by', 'Str0ng!Pass')).resolves.toBeNull();
    expect(dummy).toHaveBeenCalledTimes(1);
  });

  it('should return null when the account is deactivated even with the right password', async () => {
    const harness = createUsersHarness();
    const userId = await seedDoctor(harness);
    await harness.users.deactivate(userId, ADMIN);
    const credentials = new CredentialsService(harness.store, harness.hasher);

    await expect(credentials.verify('petrov@example.by', 'Str0ng!Pass')).resolves.toBeNull();
  });
});

describe('UserIdentityResolver', () => {
  it('should resolve a DOCTOR with its PractitionerRole link when the account is active', async () => {
    const harness = createUsersHarness();
    const userId = await seedDoctor(harness, 'role-7');

    const identity = await new UserIdentityResolver(harness.store).resolve(userId);

    expect(identity).toEqual({ userId, role: Role.DOCTOR, practitionerRoleId: 'role-7' });
  });

  it('should resolve a PATIENT with its Patient link when the account self-registered', async () => {
    const harness = createUsersHarness();
    const user = await harness.registration.registerPatient({
      email: 'ivanov@example.by',
      firstName: 'Иван',
      lastName: 'Иванов',
      password: 'Str0ng!Pass',
      birthDate: '1990-05-12',
    });

    const identity = await new UserIdentityResolver(harness.store).resolve(user.id);

    expect(identity).toMatchObject({ role: Role.PATIENT, patientId: user.patientRef?.replace('Patient/', '') });
  });

  it('should resolve null when the account is deactivated', async () => {
    const harness = createUsersHarness();
    const userId = await seedDoctor(harness);
    await harness.users.deactivate(userId, ADMIN);

    await expect(new UserIdentityResolver(harness.store).resolve(userId)).resolves.toBeNull();
  });

  it('should resolve null when the account does not exist', async () => {
    const harness = createUsersHarness();

    await expect(new UserIdentityResolver(harness.store).resolve('missing')).resolves.toBeNull();
  });
});

describe('BootstrapAdminService', () => {
  const ADMIN_ENV = {
    email: 'admin@medcenter.by',
    password: 'Adm1n!Passw0rd',
    firstName: 'Администратор',
    lastName: 'Системный',
  } as const;

  it('should create the ADMIN account once and audit it as the system actor', async () => {
    const harness = createUsersHarness();
    const bootstrap = new BootstrapAdminService(harness.accounts, harness.store);

    await bootstrap.ensureAdmin(ADMIN_ENV);
    await bootstrap.ensureAdmin(ADMIN_ENV);

    expect(harness.store.users.size).toBe(1);
    expect((await harness.store.findByEmail('admin@medcenter.by'))?.roles).toEqual([Role.ADMIN]);
    expect(createdOf(harness.fhir, 'AuditEvent')[0]).toMatchObject({
      agent: [{ who: { identifier: { value: 'system:auth-service' } } }],
    });
  });

  it('should do nothing when no bootstrap account is configured', async () => {
    const harness = createUsersHarness();
    const saved = { email: process.env['BOOTSTRAP_ADMIN_EMAIL'], password: process.env['BOOTSTRAP_ADMIN_PASSWORD'] };
    delete process.env['BOOTSTRAP_ADMIN_EMAIL'];
    delete process.env['BOOTSTRAP_ADMIN_PASSWORD'];

    await new BootstrapAdminService(harness.accounts, harness.store).onApplicationBootstrap();

    expect(harness.store.users.size).toBe(0);
    if (saved.email !== undefined) process.env['BOOTSTRAP_ADMIN_EMAIL'] = saved.email;
    if (saved.password !== undefined) process.env['BOOTSTRAP_ADMIN_PASSWORD'] = saved.password;
  });
});
