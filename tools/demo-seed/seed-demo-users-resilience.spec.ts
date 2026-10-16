import type { FetchLike } from '../shared/fhir-http';
import { readUsersConfig } from './demo-cli-options';
import type { DemoUsersSection } from './demo-manifest';
import { ADMIN_EMAIL, ADMIN_PASSWORD, authService } from './fake-auth-api';
import { planDoctorAccounts, seedDemoUsers, toRejectedRecord, toUserRecord, type UsersProgress, type UsersSeedConfig } from './seed-demo-users';

const NOW = new Date('2026-11-02T10:00:00.000Z');
const PETROV = 'doctor.petrov@medcenter.test';

function configOf(previous?: DemoUsersSection): UsersSeedConfig {
  return readUsersConfig({ BOOTSTRAP_ADMIN_EMAIL: ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD: ADMIN_PASSWORD }, previous, NOW, true);
}

/** Forwards to the service, but a request for `email` rejects like a dropped connection; `afterSend` lets the account be created first. */
function rejectingFor(email: string, inner: FetchLike, afterSend: boolean): FetchLike {
  return async (url, init) => {
    if (!String(init?.body).includes(email)) {
      return inner(url, init);
    }
    if (afterSend) {
      await inner(url, init);
    }
    throw new TypeError('fetch failed');
  };
}

function accountOf(section: DemoUsersSection, email: string): DemoUsersSection['accounts'][number] | undefined {
  return section.accounts.find((account) => account.email === email);
}

describe('toUserRecord', () => {
  const config = configOf();
  const [doctor] = planDoctorAccounts(config);

  it('should still record the account as created with its password when the 201 body is not JSON', () => {
    const record = toUserRecord(config, doctor, { status: 201, text: '<html>gateway</html>' });

    expect(record).toMatchObject({ status: 'created', password: doctor.password });
    expect(record.userId).toBeUndefined();
    expect(record.detail).toContain('userId unknown');
  });

  it('should still record the account as created when the 201 body is JSON null', () => {
    const record = toUserRecord(config, doctor, { status: 201, text: 'null' });

    expect(record).toMatchObject({ status: 'created', password: doctor.password });
  });
});

describe('toRejectedRecord', () => {
  it('should keep the planned password because the account may exist when the answer was lost', () => {
    const [doctor] = planDoctorAccounts(configOf());

    const record = toRejectedRecord(doctor, new TypeError('fetch failed'));

    expect(record).toMatchObject({ status: 'failed', email: doctor.email, password: doctor.password });
    expect(record.detail).toContain('fetch failed');
  });
});

describe('seedDemoUsers when a request rejects', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('should keep the passwords of created accounts when a later request rejects', async () => {
    // Arrange
    const service = authService();

    // Act
    const section = await seedDemoUsers(configOf(), rejectingFor(PETROV, service.fetchImpl, false));

    // Assert
    const created = section.accounts.filter((account) => account.status === 'created');
    expect(created).toHaveLength(7);
    expect(created.every((account) => typeof account.password === 'string' && account.password.length >= 10)).toBe(true);
    expect(accountOf(section, PETROV)).toMatchObject({ status: 'failed' });
  });

  it('should reuse the kept password on a re-run when the account was created but its answer was lost', async () => {
    // Arrange
    const service = authService();
    const first = await seedDemoUsers(configOf(), rejectingFor(PETROV, service.fetchImpl, true));

    // Act
    const second = await seedDemoUsers(configOf(first), service.fetchImpl);

    // Assert
    expect(accountOf(second, PETROV)).toMatchObject({ status: 'exists', password: accountOf(first, PETROV)?.password });
    expect(service.created.filter((email) => email === PETROV)).toHaveLength(1);
  });

  it('should not put a password into the failure detail when a request rejects', async () => {
    const service = authService();

    const section = await seedDemoUsers(configOf(), rejectingFor(PETROV, service.fetchImpl, false));

    expect(accountOf(section, PETROV)?.detail).not.toContain(accountOf(section, PETROV)?.password ?? 'unreachable');
  });
});

describe('seedDemoUsers progress', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('should report the section after every account so the manifest can be written as it grows', async () => {
    // Arrange
    const service = authService();
    const sizes: number[] = [];
    const onProgress: UsersProgress = async (section) => {
      sizes.push(section.accounts.filter((account) => account.status === 'created').length);
    };

    // Act
    await seedDemoUsers(configOf(), service.fetchImpl, onProgress);

    // Assert
    expect(sizes).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('should keep the previous passwords of accounts not reached yet when a re-run is interrupted', async () => {
    // Arrange
    const service = authService();
    const first = await seedDemoUsers(configOf(), service.fetchImpl);
    const snapshots: DemoUsersSection[] = [];
    const onProgress: UsersProgress = async (section) => {
      snapshots.push(section);
      if (snapshots.length === 2) {
        throw new Error('interrupted');
      }
    };

    // Act
    await expect(seedDemoUsers(configOf(first), service.fetchImpl, onProgress)).rejects.toThrow('interrupted');

    // Assert
    const lastWritten = snapshots[snapshots.length - 1];
    expect(lastWritten?.accounts.map((account) => account.password)).toEqual(first.accounts.map((account) => account.password));
  });
});
