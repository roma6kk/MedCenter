import { Role } from '@medcenter/contracts';

import { createUsersHarness, type UsersHarness } from './__tests__/users-harness';
import { ADMIN, doctorDto, seedPatient } from './__tests__/users-fixtures';

const PASSWORD = 'Str0ng!Pass';
const DAY_MS = 86_400_000;
const RETENTION_DAYS = 100;

function harnessWithRetention(now: () => Date = () => new Date()): UsersHarness {
  return createUsersHarness({ retentionDays: RETENTION_DAYS, now });
}

describe('UsersService account retention', () => {
  it('should store closedAt and retentionUntil when a patient closes the account', async () => {
    const harness = harnessWithRetention();
    const userId = await seedPatient(harness);

    await harness.users.deactivateSelf(userId, PASSWORD, { sub: userId });

    const user = await harness.store.findById(userId);
    expect(user?.closedAt).toBeInstanceOf(Date);
    expect(user?.retentionUntil?.getTime()).toBe((user?.closedAt?.getTime() ?? 0) + RETENTION_DAYS * DAY_MS);
  });

  it('should store the same pair when an admin deactivates the account', async () => {
    const harness = harnessWithRetention();
    const userId = await seedPatient(harness);

    await harness.users.deactivate(userId, ADMIN);

    const user = await harness.store.findById(userId);
    expect(user?.retentionUntil?.getTime()).toBe((user?.closedAt?.getTime() ?? 0) + RETENTION_DAYS * DAY_MS);
  });

  it('should store the pair when an admin turns isActive off through PATCH', async () => {
    const harness = harnessWithRetention();
    const created = await harness.users.create(doctorDto(), ADMIN);

    await harness.users.update(created.id, { isActive: false }, ADMIN);

    expect((await harness.store.findById(created.id))?.retentionUntil).toBeInstanceOf(Date);
  });

  it('should clear the pair when an admin reactivates the account', async () => {
    const harness = harnessWithRetention();
    const created = await harness.users.create(doctorDto(), ADMIN);
    await harness.users.deactivate(created.id, ADMIN);

    await harness.users.update(created.id, { isActive: true }, ADMIN);

    const user = await harness.store.findById(created.id);
    expect(user?.isActive).toBe(true);
    expect(user?.closedAt).toBeUndefined();
    expect(user?.retentionUntil).toBeUndefined();
  });

  it('should keep the original dates when an already closed account is deactivated again', async () => {
    const harness = harnessWithRetention();
    const created = await harness.users.create(doctorDto(), ADMIN);
    await harness.users.deactivate(created.id, ADMIN);
    const first = await harness.store.findById(created.id);

    await harness.users.deactivate(created.id, ADMIN);

    expect((await harness.store.findById(created.id))?.retentionUntil).toEqual(first?.retentionUntil);
  });

  it('should list only closed accounts whose retention has passed, oldest first', async () => {
    let now = new Date('2026-01-01T00:00:00Z');
    const harness = harnessWithRetention(() => now);
    const expiredA = await harness.users.create(doctorDto({ email: 'a@example.by', lastName: 'Анин' }), ADMIN);
    const expiredB = await harness.users.create(doctorDto({ email: 'b@example.by', lastName: 'Банин' }), ADMIN);
    await harness.users.deactivate(expiredA.id, ADMIN);
    now = new Date('2026-01-02T00:00:00Z');
    await harness.users.deactivate(expiredB.id, ADMIN);
    now = new Date('2026-04-02T00:00:00Z');
    const recent = await harness.users.create(doctorDto({ email: 'c@example.by' }), ADMIN);
    await harness.users.deactivate(recent.id, ADMIN);
    await harness.users.create(doctorDto({ email: 'd@example.by' }), ADMIN);
    now = new Date('2026-04-12T00:00:00Z');

    const page = await harness.users.listRetentionExpired({});

    expect(page.items.map((item) => item.id)).toEqual([expiredA.id, expiredB.id]);
    expect(page.items[0]).toEqual({
      id: expiredA.id,
      name: 'Анин Пётр',
      closedAt: '2026-01-01T00:00:00.000Z',
      retentionUntil: '2026-04-11T00:00:00.000Z',
    });
    expect(page.meta.totalItems).toBe(2);
  });

  it('should expose neither e-mail nor roles in the expired list', async () => {
    let now = new Date('2026-01-01T00:00:00Z');
    const harness = harnessWithRetention(() => now);
    const created = await harness.users.create(doctorDto({ roles: [Role.DOCTOR] }), ADMIN);
    await harness.users.deactivate(created.id, ADMIN);
    now = new Date('2027-01-01T00:00:00Z');

    const page = await harness.users.listRetentionExpired({});

    expect(Object.keys(page.items[0] ?? {}).sort()).toEqual(['closedAt', 'id', 'name', 'retentionUntil']);
  });

  it('should page the expired list', async () => {
    let now = new Date('2026-01-01T00:00:00Z');
    const harness = harnessWithRetention(() => now);
    for (const email of ['a@example.by', 'b@example.by', 'c@example.by']) {
      const created = await harness.users.create(doctorDto({ email }), ADMIN);
      await harness.users.deactivate(created.id, ADMIN);
    }
    now = new Date('2027-01-01T00:00:00Z');

    const page = await harness.users.listRetentionExpired({ page: 2, pageSize: 2 });

    expect(page.items).toHaveLength(1);
    expect(page.meta).toMatchObject({ page: 2, pageSize: 2, totalItems: 3, totalPages: 2 });
  });
});
