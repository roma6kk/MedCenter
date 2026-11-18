import { createdOf, createUsersHarness } from './__tests__/users-harness';
import { ADMIN, seedPatient } from './__tests__/users-fixtures';

const PASSWORD = 'Str0ng!Pass';

async function seeded(): Promise<{ readonly harness: ReturnType<typeof createUsersHarness>; readonly userId: string }> {
  const harness = createUsersHarness();
  return { harness, userId: await seedPatient(harness) };
}

describe('UsersService.deactivateSelf', () => {
  it('should deactivate the account and stamp the account consent as withdrawn when the password matches', async () => {
    const { harness, userId } = await seeded();

    await harness.users.deactivateSelf(userId, PASSWORD, { sub: userId, requestId: 'req-9' });

    const user = await harness.store.findById(userId);
    expect(user?.isActive).toBe(false);
    expect(user?.accountConsentWithdrawnAt).toBeInstanceOf(Date);
    expect(user?.accountConsentAt).toBeInstanceOf(Date);
  });

  it('should refuse with INVALID_PASSWORD and change nothing when the password is wrong', async () => {
    const { harness, userId } = await seeded();

    await expect(harness.users.deactivateSelf(userId, 'Wrong!Pass1', { sub: userId })).rejects.toMatchObject({
      status: 403,
      response: { errorCode: 'INVALID_PASSWORD' },
    });

    const user = await harness.store.findById(userId);
    expect(user?.isActive).toBe(true);
    expect(user?.accountConsentWithdrawnAt).toBeUndefined();
  });

  it('should write a user.deactivated AuditEvent of the patient themselves', async () => {
    const { harness, userId } = await seeded();
    const before = createdOf(harness.fhir, 'AuditEvent').length;

    await harness.users.deactivateSelf(userId, PASSWORD, { sub: userId });

    const audits = createdOf(harness.fhir, 'AuditEvent');
    expect(audits).toHaveLength(before + 1);
    expect(audits[audits.length - 1]).toMatchObject({ action: 'U', agent: [{ who: { identifier: { value: userId } } }] });
    expect(JSON.stringify(audits[audits.length - 1])).toContain('user.deactivated');
  });

  it('should leave the FHIR Patient untouched', async () => {
    const { harness, userId } = await seeded();
    harness.fhir.update.mockClear();
    harness.fhir.delete.mockClear();
    harness.fhir.batch.mockClear();

    await harness.users.deactivateSelf(userId, PASSWORD, { sub: userId });

    expect(harness.fhir.delete).not.toHaveBeenCalled();
    expect(harness.fhir.update).not.toHaveBeenCalled();
    expect(harness.fhir.batch).not.toHaveBeenCalled();
  });

  it('should refuse an already deactivated account with the same error as a wrong password', async () => {
    const { harness, userId } = await seeded();
    await harness.users.deactivateSelf(userId, PASSWORD, { sub: userId });

    await expect(harness.users.deactivateSelf(userId, PASSWORD, { sub: userId })).rejects.toMatchObject({ status: 403 });
  });

  it('should refuse an admin reactivation of a self-closed account with ACCOUNT_CONSENT_WITHDRAWN and keep it closed', async () => {
    const { harness, userId } = await seeded();
    await harness.users.deactivateSelf(userId, PASSWORD, { sub: userId });

    await expect(harness.users.update(userId, { isActive: true }, ADMIN)).rejects.toMatchObject({
      status: 409,
      response: { errorCode: 'ACCOUNT_CONSENT_WITHDRAWN' },
    });

    expect((await harness.store.findById(userId))?.isActive).toBe(false);
  });

  it('should still let an admin edit the name of a self-closed account when isActive is not turned on', async () => {
    const { harness, userId } = await seeded();
    await harness.users.deactivateSelf(userId, PASSWORD, { sub: userId });

    const updated = await harness.users.update(userId, { lastName: 'Сидоров' }, ADMIN);

    expect(updated.lastName).toBe('Сидоров');
    expect(updated.isActive).toBe(false);
  });

  it('should expose the withdrawal moment on the account card', async () => {
    const { harness, userId } = await seeded();
    await harness.users.deactivateSelf(userId, PASSWORD, { sub: userId });

    const details = await harness.users.getById(userId);

    expect(details.accountConsentWithdrawnAt).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
  });
});
