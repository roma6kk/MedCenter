import type { FetchLike } from '../shared/fhir-http';
import { readUsersConfig } from './demo-cli-options';
import { demoIds } from './demo-ids';
import { ADMIN_EMAIL, ADMIN_PASSWORD, authService } from './fake-auth-api';
import {
  emailOf,
  planAdminAccounts,
  planDoctorAccounts,
  planPatientAccounts,
  seedDemoUsers,
  toUserRecord,
  type PlannedAccount,
  type UsersSeedConfig,
} from './seed-demo-users';

const ADMIN_ENV = { BOOTSTRAP_ADMIN_EMAIL: ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD: ADMIN_PASSWORD };
const NOW = new Date('2026-11-02T10:00:00.000Z');
const API = 'http://localhost:8081';

function configOf(env: NodeJS.ProcessEnv = {}, previous?: UsersSeedConfig['previous']): UsersSeedConfig {
  return readUsersConfig({ ...ADMIN_ENV, ...env }, previous, NOW, true);
}

function accountFor(config: UsersSeedConfig, role: 'DOCTOR' | 'PATIENT'): PlannedAccount {
  const [first] = role === 'DOCTOR' ? planDoctorAccounts(config) : planPatientAccounts(config);
  return first;
}

describe('emailOf', () => {
  it('should join the local part and the demo domain', () => {
    expect(emailOf('doctor.ivanova', 'medcenter.test')).toBe('doctor.ivanova@medcenter.test');
  });
});

describe('planAdminAccounts', () => {
  it('should create one demo ADMIN through the admin endpoint with the ADMIN role only', () => {
    const [admin, ...rest] = planAdminAccounts(configOf());

    expect(rest).toEqual([]);
    expect(admin).toMatchObject({ role: 'ADMIN', email: 'admin.demo@medcenter.test', path: '/api/v1/admin/users' });
    expect(Object.keys(admin?.body ?? {}).sort()).toEqual(['email', 'firstName', 'lastName', 'password', 'roles']);
    expect(admin?.body['roles']).toEqual(['ADMIN']);
  });

  it('should use DEMO_ADMIN_PASSWORD when it is configured', () => {
    expect(planAdminAccounts(configOf({ DEMO_ADMIN_PASSWORD: 'Adm1n!Demo1234' }))[0]?.password).toBe('Adm1n!Demo1234');
  });
});

describe('planDoctorAccounts', () => {
  it('should create one DOCTOR per catalog doctor through the admin endpoint, linked to the seeded PractitionerRole', () => {
    const accounts = planDoctorAccounts(configOf());

    expect(accounts).toHaveLength(4);
    expect(accounts.every((account) => account.path === '/api/v1/admin/users' && account.role === 'DOCTOR')).toBe(true);
    expect(accounts[0]?.body).toEqual({
      email: 'doctor.ivanova@medcenter.test',
      password: accounts[0]?.password,
      firstName: 'Мария',
      lastName: 'Иванова',
      roles: ['DOCTOR'],
      practitionerRoleId: demoIds.practitionerRole('ivanova'),
    });
  });

  it('should send only the fields of CreateUserDto, never patient demographics', () => {
    const body = accountFor(configOf(), 'DOCTOR').body;

    expect(Object.keys(body).sort()).toEqual(['email', 'firstName', 'lastName', 'password', 'practitionerRoleId', 'roles']);
  });

  it('should use the password from the environment when one is configured', () => {
    expect(planDoctorAccounts(configOf({ DEMO_DOCTOR_PASSWORD: 'D0ctor!Pass12' })).map((account) => account.password)).toEqual(
      Array(4).fill('D0ctor!Pass12'),
    );
  });

  it('should reuse the password the previous run recorded for the same account', () => {
    const previous = {
      generatedAt: 'x',
      authBaseUrl: API,
      accounts: [{ role: 'DOCTOR' as const, email: 'doctor.ivanova@medcenter.test', password: 'Recorded!Pass12', status: 'created' as const }],
    };

    expect(planDoctorAccounts(configOf({}, previous))[0]?.password).toBe('Recorded!Pass12');
  });

  it('should generate a distinct password per doctor when nothing supplies one', () => {
    const passwords = planDoctorAccounts(configOf()).map((account) => account.password);

    expect(new Set(passwords).size).toBe(4);
  });
});

describe('planPatientAccounts', () => {
  it('should self-register the demo patients through the public endpoint with the RegisterPatientDto fields', () => {
    const accounts = planPatientAccounts(configOf());

    expect(accounts).toHaveLength(3);
    expect(accounts.every((account) => account.path === '/api/v1/auth/register' && account.role === 'PATIENT')).toBe(true);
    expect(Object.keys(accounts[0]?.body ?? {}).sort()).toEqual(['accountConsent', 'birthDate', 'email', 'firstName', 'gender', 'lastName', 'password']);
    expect(accounts[0]?.body['birthDate']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should accept the account consent text at registration (API 2.2.6), in the version the web form sends', () => {
    for (const account of planPatientAccounts(configOf())) {
      expect(account.body['accountConsent']).toEqual({ accepted: true, textVersion: '2026-10' });
    }
  });
});

describe('toUserRecord', () => {
  const config = configOf();
  const doctor = accountFor(config, 'DOCTOR');

  it('should record a created account with its generated password and id', () => {
    const record = toUserRecord(config, doctor, { status: 201, text: JSON.stringify({ id: 'user-1' }) });

    expect(record).toEqual({
      role: 'DOCTOR',
      email: doctor.email,
      practitionerRoleId: doctor.practitionerRoleId,
      userId: 'user-1',
      password: doctor.password,
      status: 'created',
    });
  });

  it('should record a repeated email as existing and keep the earlier password, not the one that was never applied', () => {
    const previous = { generatedAt: 'x', authBaseUrl: API, accounts: [{ role: 'DOCTOR' as const, email: doctor.email, password: 'Earlier!Pass12', status: 'created' as const }] };

    const record = toUserRecord(configOf({}, previous), doctor, {
      status: 409,
      text: '{"detail":"EMAIL_TAKEN: a user with this email already exists"}',
    });

    expect(record).toMatchObject({ status: 'exists', password: 'Earlier!Pass12' });
  });

  it('should say so when the account exists but no password was ever recorded', () => {
    const record = toUserRecord(config, doctor, { status: 409, text: '{"detail":"EMAIL_TAKEN: x"}' });

    expect(record.status).toBe('exists');
    expect(record.password).toBeUndefined();
    expect(record.detail).toContain('not in the manifest');
  });

  it('should fail on a conflict that is not a repeated email, e.g. a PractitionerRole linked to another user', () => {
    const record = toUserRecord(config, doctor, { status: 409, text: '{"detail":"PRACTITIONER_ROLE_TAKEN: linked"}' });

    expect(record).toMatchObject({ status: 'failed' });
    expect(record.password).toBeUndefined();
  });

  it.each([400, 401, 403, 422, 500])('should fail on HTTP %s and keep the answer as detail', (status) => {
    const record = toUserRecord(config, doctor, { status, text: '{"detail":"nope"}' });

    expect(record).toMatchObject({ status: 'failed', detail: `HTTP ${status}: {"detail":"nope"}` });
  });
});

describe('seedDemoUsers', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('should create the demo admin, doctors and patients and list the bootstrap admin without a password', async () => {
    const service = authService();

    const section = await seedDemoUsers(configOf(), service.fetchImpl);

    expect(section.accounts.map((account) => [account.role, account.status])).toEqual([
      ['ADMIN', 'exists'],
      ['ADMIN', 'created'],
      ...Array(4).fill(['DOCTOR', 'created']),
      ...Array(3).fill(['PATIENT', 'created']),
    ]);
    expect(section.accounts[0]).not.toHaveProperty('password');
    expect(section.authBaseUrl).toBe(API);
    expect(section.generatedAt).toBe(NOW.toISOString());
  });

  it('should send the admin Bearer token only to the admin endpoint, not to the public registration', async () => {
    const service = authService();

    await seedDemoUsers(configOf(), service.fetchImpl);

    const admin = service.calls.filter((call) => call.path === '/api/v1/admin/users');
    const register = service.calls.filter((call) => call.path === '/api/v1/auth/register');
    expect(admin.every((call) => call.authorization === 'Bearer jwt.for.admin@medcenter.test')).toBe(true);
    expect(register.every((call) => call.authorization === undefined)).toBe(true);
    expect([admin.length, register.length]).toEqual([5, 3]);
  });

  it('should record every account as existing and keep every password when the run is repeated', async () => {
    const service = authService();
    const first = await seedDemoUsers(configOf(), service.fetchImpl);

    const second = await seedDemoUsers(configOf({}, first), service.fetchImpl);

    expect(second.accounts.slice(1).every((account) => account.status === 'exists')).toBe(true);
    expect(second.accounts.map((account) => account.password)).toEqual(first.accounts.map((account) => account.password));
    expect(service.created).toHaveLength(8);
  });

  it('should keep going after one account fails and report it as failed', async () => {
    const service = authService();
    const flaky: FetchLike = async (url, init) =>
      String(init?.body).includes('doctor.petrov') ? new Response('{"detail":"boom"}', { status: 500 }) : service.fetchImpl(url, init);

    const section = await seedDemoUsers(configOf(), flaky);

    expect(section.accounts.filter((account) => account.status === 'failed').map((account) => account.email)).toEqual([
      'doctor.petrov@medcenter.test',
    ]);
    expect(section.accounts.filter((account) => account.status === 'created')).toHaveLength(7);
  });

  it('should never print a password', async () => {
    const service = authService();

    await seedDemoUsers(configOf({ DEMO_DOCTOR_PASSWORD: 'D0ctor!Secret12' }), service.fetchImpl);

    const printed = JSON.stringify((console.log as jest.Mock).mock.calls);
    expect(printed).not.toContain('D0ctor!Secret12');
    expect(printed).not.toContain(ADMIN_ENV.BOOTSTRAP_ADMIN_PASSWORD);
  });

  it('should stop before creating anything when the OAuth client narrowed the admin grant below user/*.write', async () => {
    const service = authService(undefined, 'launch');

    await expect(seedDemoUsers(configOf(), service.fetchImpl)).rejects.toThrow('user/*.write');
    expect(service.created).toEqual([]);
  });

  it('should stop before creating anything when the admin cannot log in', async () => {
    const service = authService({});

    await expect(seedDemoUsers(configOf(), service.fetchImpl)).rejects.toThrow('credentials rejected');
    expect(service.created).toEqual([]);
  });
});
