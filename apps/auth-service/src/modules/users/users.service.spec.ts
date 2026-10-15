import { ConflictException } from '@nestjs/common';
import { Role } from '@medcenter/contracts';
import { FhirClientError } from '@medcenter/fhir';

import { ADMIN, doctorDto, seedPatient } from './__tests__/users-fixtures';
import { createdOf, createUsersHarness, transactionWrites } from './__tests__/users-harness';

describe('UsersService', () => {
  it('should soft-deactivate rather than delete a user', async () => {
    const harness = createUsersHarness();
    const userId = await seedPatient(harness);

    const user = await harness.users.deactivate(userId, ADMIN);

    expect(user.isActive).toBe(false);
    expect(await harness.store.findById(userId)).not.toBeNull();
  });

  it('should write an update AuditEvent when a user is deactivated', async () => {
    const harness = createUsersHarness();
    const userId = await seedPatient(harness);

    await harness.users.deactivate(userId, ADMIN);

    const audits = createdOf(harness.fhir, 'AuditEvent');
    expect(audits[audits.length - 1]).toMatchObject({
      action: 'U',
      agent: [{ who: { identifier: { value: 'admin-1' } } }],
    });
  });

  it('should refuse with SELF_LOCKOUT when an administrator deactivates their own account', async () => {
    const harness = createUsersHarness();

    await expect(harness.users.deactivate('admin-1', ADMIN)).rejects.toThrow('SELF_LOCKOUT');
  });

  it('should answer 404 when the user to deactivate does not exist', async () => {
    const harness = createUsersHarness();

    await expect(harness.users.deactivate('missing', ADMIN)).rejects.toMatchObject({ status: 404 });
  });

  it('should link a DOCTOR to its PractitionerRole when an admin creates the account', async () => {
    const harness = createUsersHarness();

    const user = await harness.users.create(doctorDto({ practitionerRoleId: 'role-7' }), ADMIN);

    expect(harness.fhir.read).toHaveBeenCalledWith('PractitionerRole', 'role-7');
    expect(user.practitionerRoleRef).toBe('PractitionerRole/role-7');
    expect(user.externalLinks).toEqual([
      { resourceType: 'PractitionerRole', resourceId: 'role-7', reference: 'PractitionerRole/role-7' },
    ]);
  });

  it('should answer 404 and create nothing when the PractitionerRole does not exist', async () => {
    const harness = createUsersHarness();
    harness.fhir.read.mockRejectedValueOnce(new FhirClientError('GET', 'http://hapi/PractitionerRole/x', 404));

    await expect(harness.users.create(doctorDto({ practitionerRoleId: 'x' }), ADMIN)).rejects.toMatchObject({
      status: 404,
    });
    expect(harness.store.users.size).toBe(0);
  });

  it('should refuse a second account on the same PractitionerRole and compensate the new user', async () => {
    const harness = createUsersHarness();
    await harness.users.create(doctorDto({ practitionerRoleId: 'role-7' }), ADMIN);

    const attempt = harness.users.create(doctorDto({ email: 'other@example.by', practitionerRoleId: 'role-7' }), ADMIN);

    await expect(attempt).rejects.toThrow('PRACTITIONER_ROLE_TAKEN');
    expect(harness.store.users.size).toBe(1);
  });

  it('should reject a practitionerRoleId when the account is not a DOCTOR', async () => {
    const harness = createUsersHarness();

    await expect(
      harness.users.create(doctorDto({ roles: [Role.ADMIN], practitionerRoleId: 'role-7' }), ADMIN),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('should require a birthDate when an admin creates a PATIENT account', async () => {
    const harness = createUsersHarness();

    await expect(harness.users.create(doctorDto({ roles: [Role.PATIENT] }), ADMIN)).rejects.toThrow('birthDate');
  });

  it('should provision a FHIR Patient when an admin creates a PATIENT account', async () => {
    const harness = createUsersHarness();

    const user = await harness.users.create(doctorDto({ roles: [Role.PATIENT], birthDate: '1985-01-02' }), ADMIN);

    expect(user.patientRef).toMatch(/^Patient\//);
    expect(harness.publisher.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'patient.registered.v1' }));
  });

  it('should replace roles and link the PractitionerRole when an admin patches a user', async () => {
    const harness = createUsersHarness();
    const created = await harness.users.create(doctorDto({ roles: [Role.ADMIN] }), ADMIN);

    const updated = await harness.users.update(
      created.id,
      { roles: [Role.DOCTOR], practitionerRoleId: 'role-9' },
      ADMIN,
    );

    expect(updated).toMatchObject({ roles: [Role.DOCTOR], role: Role.DOCTOR, practitionerRoleRef: 'PractitionerRole/role-9' });
  });

  it('should sync the linked FHIR Patient when an admin changes the demographics', async () => {
    const harness = createUsersHarness();
    const userId = await seedPatient(harness);

    await harness.users.update(userId, { lastName: 'Сидоров', birthDate: '1991-02-03' }, ADMIN);

    expect(transactionWrites(harness.fhir)).toEqual([
      expect.objectContaining({
        url: expect.stringMatching(/^Patient\//),
        ifMatch: 'W/"1"',
        resource: expect.objectContaining({ birthDate: '1991-02-03' }),
      }),
    ]);
    expect((await harness.store.findById(userId))?.lastName).toBe('Сидоров');
  });

  it('should carry a changed email into the Patient home telecom when an admin patches it', async () => {
    const harness = createUsersHarness();
    const userId = await seedPatient(harness);

    await harness.users.update(userId, { email: 'New.Address@Example.by' }, ADMIN);

    const [write] = transactionWrites(harness.fhir);
    expect(write?.resource['telecom']).toEqual([{ system: 'email', value: 'new.address@example.by', use: 'home' }]);
  });

  it('should answer EMAIL_TAKEN when the new email belongs to another account', async () => {
    const harness = createUsersHarness();
    const userId = await seedPatient(harness);
    await seedPatient(harness, 'taken@example.by');

    const attempt = harness.users.update(userId, { email: 'Taken@example.by' }, ADMIN);

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toThrow('EMAIL_TAKEN');
  });

  it('should refuse to grant PATIENT to an account without a linked Patient', async () => {
    const harness = createUsersHarness();
    const created = await harness.users.create(doctorDto(), ADMIN);

    await expect(harness.users.update(created.id, { roles: [Role.PATIENT] }, ADMIN)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('should refuse with SELF_LOCKOUT when an administrator drops their own ADMIN role', async () => {
    const harness = createUsersHarness();
    const admin = await harness.users.create(doctorDto({ roles: [Role.ADMIN] }), ADMIN);

    await expect(harness.users.update(admin.id, { roles: [Role.DOCTOR] }, { sub: admin.id })).rejects.toThrow(
      'SELF_LOCKOUT',
    );
  });

  it('should page and filter the list with PaginatedResponseDto meta when users are listed', async () => {
    const harness = createUsersHarness();
    await seedPatient(harness, 'a@example.by');
    await seedPatient(harness, 'b@example.by');
    await harness.users.create(doctorDto(), ADMIN);

    const page = await harness.users.list({ role: Role.PATIENT, page: 1, pageSize: 1 });

    expect(page.meta).toEqual({ page: 1, pageSize: 1, totalItems: 2, totalPages: 2 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.roles).toEqual([Role.PATIENT]);
  });

  it('should return the caller with its ExternalLink when /me is requested', async () => {
    const harness = createUsersHarness();
    const userId = await seedPatient(harness);

    const me = await harness.users.me(userId);

    expect(me.externalLinks[0]).toMatchObject({ resourceType: 'Patient' });
  });
});
