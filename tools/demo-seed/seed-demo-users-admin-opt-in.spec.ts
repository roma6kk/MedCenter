import { readUsersConfig } from './demo-cli-options';
import { ADMIN_EMAIL, ADMIN_PASSWORD, authService } from './fake-auth-api';
import { seedDemoUsers, type UsersSeedConfig } from './seed-demo-users';

const ENV = { BOOTSTRAP_ADMIN_EMAIL: ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD: ADMIN_PASSWORD };
const NOW = new Date('2026-11-02T10:00:00.000Z');
const DEMO_ADMIN = 'admin.demo@medcenter.test';

function configOf(withAdmin: boolean, previous?: UsersSeedConfig['previous']): UsersSeedConfig {
  return readUsersConfig(ENV, previous, NOW, withAdmin);
}

describe('seedDemoUsers without --with-admin', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('should create the doctors and patients but no demo admin when the flag is not given', async () => {
    const service = authService();

    const section = await seedDemoUsers(configOf(false), service.fetchImpl);

    expect(section.accounts.map((account) => [account.role, account.status])).toEqual([
      ['ADMIN', 'exists'],
      ...Array(4).fill(['DOCTOR', 'created']),
      ...Array(3).fill(['PATIENT', 'created']),
    ]);
    expect(service.created).not.toContain(DEMO_ADMIN);
  });

  it('should keep the demo admin and its password in the manifest when a later run omits the flag', async () => {
    const service = authService();
    const first = await seedDemoUsers(configOf(true), service.fetchImpl);
    const recorded = first.accounts.find((account) => account.email === DEMO_ADMIN);

    const second = await seedDemoUsers(configOf(false, first), service.fetchImpl);

    expect(recorded?.password).toBeDefined();
    expect(second.accounts.find((account) => account.email === DEMO_ADMIN)).toEqual(recorded);
  });

  it('should list the bootstrap admin once and never as a demo admin to keep', async () => {
    const service = authService();
    const first = await seedDemoUsers(configOf(true), service.fetchImpl);

    const second = await seedDemoUsers(configOf(false, first), service.fetchImpl);

    expect(second.accounts.filter((account) => account.email === ADMIN_EMAIL)).toHaveLength(1);
  });
});
