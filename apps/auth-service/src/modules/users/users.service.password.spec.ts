import { createdOf, createUsersHarness } from './__tests__/users-harness';
import { ADMIN, seedPatient } from './__tests__/users-fixtures';

const OLD = 'Str0ng!Pass';
const NEW = 'N3w!Password';

async function seeded(): Promise<{ readonly harness: ReturnType<typeof createUsersHarness>; readonly userId: string }> {
  const harness = createUsersHarness();
  return { harness, userId: await seedPatient(harness) };
}

async function passwordWorks(harness: ReturnType<typeof createUsersHarness>, userId: string, password: string): Promise<boolean> {
  const user = await harness.store.findById(userId);
  return harness.hasher.verify(password, user?.passwordHash ?? '');
}

describe('UsersService.changePassword', () => {
  it('should store the new password when the current one matches', async () => {
    const { harness, userId } = await seeded();

    await harness.users.changePassword(userId, OLD, NEW, { sub: userId });

    expect(await passwordWorks(harness, userId, NEW)).toBe(true);
    expect(await passwordWorks(harness, userId, OLD)).toBe(false);
  });

  it('should refuse with INVALID_PASSWORD and change nothing when the current password is wrong', async () => {
    const { harness, userId } = await seeded();

    await expect(harness.users.changePassword(userId, 'Wrong!Pass1', NEW, { sub: userId })).rejects.toMatchObject({
      status: 403,
      response: { errorCode: 'INVALID_PASSWORD' },
    });

    expect(await passwordWorks(harness, userId, OLD)).toBe(true);
  });

  it('should write a user.password_changed AuditEvent of the user themselves', async () => {
    const { harness, userId } = await seeded();
    const before = createdOf(harness.fhir, 'AuditEvent').length;

    await harness.users.changePassword(userId, OLD, NEW, { sub: userId });

    const audits = createdOf(harness.fhir, 'AuditEvent');
    expect(audits).toHaveLength(before + 1);
    expect(JSON.stringify(audits[audits.length - 1])).toContain('user.password_changed');
  });
});

describe('UsersService.update with a password', () => {
  it('should replace the password and write a user.password_reset AuditEvent', async () => {
    const { harness, userId } = await seeded();
    const before = createdOf(harness.fhir, 'AuditEvent').length;

    await harness.users.update(userId, { password: NEW }, ADMIN);

    expect(await passwordWorks(harness, userId, NEW)).toBe(true);
    const audits = createdOf(harness.fhir, 'AuditEvent');
    expect(audits).toHaveLength(before + 1);
    expect(JSON.stringify(audits[audits.length - 1])).toContain('user.password_reset');
  });

  it('should not return the password or its hash in the answer', async () => {
    const { harness, userId } = await seeded();

    const answer = await harness.users.update(userId, { password: NEW }, ADMIN);

    expect(JSON.stringify(answer)).not.toMatch(/password|scrypt/i);
  });
});
