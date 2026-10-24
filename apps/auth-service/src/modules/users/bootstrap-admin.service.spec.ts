import { ConflictException } from '@nestjs/common';
import { Role } from '@medcenter/contracts';

import { SYSTEM_ACTOR } from '../audit/audit-event.builder';
import { BootstrapAdminService } from './bootstrap-admin.service';
import { createdOf, createUsersHarness, outboxRecords, type UsersHarness } from './__tests__/users-harness';

const ADMIN_EMAIL = 'Root@MedCenter.by';
const ADMIN_PASSWORD = 'Adm1n!Passw0rd';
const ENV_KEYS = [
  'BOOTSTRAP_ADMIN_EMAIL',
  'BOOTSTRAP_ADMIN_PASSWORD',
  'BOOTSTRAP_ADMIN_FIRST_NAME',
  'BOOTSTRAP_ADMIN_LAST_NAME',
] as const;

function serviceOver(harness: UsersHarness): BootstrapAdminService {
  return new BootstrapAdminService(harness.accounts, harness.store);
}

describe('BootstrapAdminService', () => {
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = saved.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe('onApplicationBootstrap', () => {
    it('should create nothing when no bootstrap account is configured', async () => {
      const harness = createUsersHarness();

      await serviceOver(harness).onApplicationBootstrap();

      expect(harness.store.users.size).toBe(0);
      expect(harness.fhir.create).not.toHaveBeenCalled();
    });

    it('should create the ADMIN with the default names when the pair is configured', async () => {
      process.env['BOOTSTRAP_ADMIN_EMAIL'] = ADMIN_EMAIL;
      process.env['BOOTSTRAP_ADMIN_PASSWORD'] = ADMIN_PASSWORD;
      const harness = createUsersHarness();

      await serviceOver(harness).onApplicationBootstrap();

      expect(await harness.store.findByEmail('root@medcenter.by')).toMatchObject({
        roles: [Role.ADMIN],
        firstName: 'Администратор',
        lastName: 'Системный',
        isActive: true,
        links: {},
      });
    });

    it('should take the names from the environment when they are configured', async () => {
      process.env['BOOTSTRAP_ADMIN_EMAIL'] = ADMIN_EMAIL;
      process.env['BOOTSTRAP_ADMIN_PASSWORD'] = ADMIN_PASSWORD;
      process.env['BOOTSTRAP_ADMIN_FIRST_NAME'] = 'Анна';
      process.env['BOOTSTRAP_ADMIN_LAST_NAME'] = 'Орлова';
      const harness = createUsersHarness();

      await serviceOver(harness).onApplicationBootstrap();

      expect(await harness.store.findByEmail('root@medcenter.by')).toMatchObject({
        firstName: 'Анна',
        lastName: 'Орлова',
      });
    });

    it('should store a scrypt hash and never the configured password when the account is created', async () => {
      process.env['BOOTSTRAP_ADMIN_EMAIL'] = ADMIN_EMAIL;
      process.env['BOOTSTRAP_ADMIN_PASSWORD'] = ADMIN_PASSWORD;
      const harness = createUsersHarness();

      await serviceOver(harness).onApplicationBootstrap();

      const stored = await harness.store.findByEmail('root@medcenter.by');
      expect(stored?.passwordHash).toMatch(/^scrypt\$/);
      expect(JSON.stringify(stored)).not.toContain(ADMIN_PASSWORD);
    });

    it.each([
      ['only the email is set', { BOOTSTRAP_ADMIN_EMAIL: ADMIN_EMAIL }, 'must be set together'],
      [
        'only the password is set',
        { BOOTSTRAP_ADMIN_PASSWORD: ADMIN_PASSWORD },
        'must be set together',
      ],
      [
        'the email is malformed',
        { BOOTSTRAP_ADMIN_EMAIL: 'root', BOOTSTRAP_ADMIN_PASSWORD: ADMIN_PASSWORD },
        'not a valid email',
      ],
      [
        'the password is weak',
        { BOOTSTRAP_ADMIN_EMAIL: ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD: 'password' },
        'password policy',
      ],
    ])('should fail the boot and create nothing when %s', async (_label, env, message) => {
      Object.assign(process.env, env);
      const harness = createUsersHarness();

      await expect(serviceOver(harness).onApplicationBootstrap()).rejects.toThrow(message);

      expect(harness.store.users.size).toBe(0);
    });
  });

  describe('ensureAdmin', () => {
    const ADMIN = {
      email: 'root@medcenter.by',
      password: ADMIN_PASSWORD,
      firstName: 'Анна',
      lastName: 'Орлова',
    } as const;

    it('should write an AuditEvent under the system actor when the administrator is created', async () => {
      const harness = createUsersHarness();

      await serviceOver(harness).ensureAdmin(ADMIN);

      expect(createdOf(harness.fhir, 'AuditEvent').at(-1)).toMatchObject({
        action: 'C',
        agent: [{ who: { identifier: { value: SYSTEM_ACTOR } }, requestor: true }],
      });
    });

    it('should not provision a FHIR Patient or write an outbox record when the administrator is created', async () => {
      const harness = createUsersHarness();

      await serviceOver(harness).ensureAdmin(ADMIN);

      expect(createdOf(harness.fhir, 'Patient')).toEqual([]);
      expect(outboxRecords(harness.fhir)).toEqual([]);
    });

    it('should leave a deactivated administrator alone when the email already exists', async () => {
      const harness = createUsersHarness();
      await serviceOver(harness).ensureAdmin(ADMIN);
      const existing = await harness.store.findByEmail(ADMIN.email);
      await harness.store.update(existing?.id ?? '', { isActive: false, roles: [Role.DOCTOR] });

      await serviceOver(harness).ensureAdmin({ ...ADMIN, password: 'An0ther!Passw0rd' });

      expect(await harness.store.findByEmail(ADMIN.email)).toMatchObject({
        isActive: false,
        roles: [Role.DOCTOR],
      });
      expect(harness.store.users.size).toBe(1);
    });

    it('should accept the loss of a race when another replica created the account at the same moment', async () => {
      const harness = createUsersHarness();
      jest
        .spyOn(harness.accounts, 'create')
        .mockRejectedValueOnce(new ConflictException('EMAIL_TAKEN'));

      await expect(serviceOver(harness).ensureAdmin(ADMIN)).resolves.toBeUndefined();
    });

    it('should fail the boot when creating the account fails for any other reason', async () => {
      const harness = createUsersHarness();
      jest.spyOn(harness.accounts, 'create').mockRejectedValueOnce(new Error('database went away'));

      await expect(serviceOver(harness).ensureAdmin(ADMIN)).rejects.toThrow('database went away');
    });
  });
});
