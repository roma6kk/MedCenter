import { FhirClientError } from '@medcenter/fhir';
import { Role } from '@medcenter/contracts';

import { ADMIN, doctorDto, seedPatient } from './__tests__/users-fixtures';
import { createdOf, createUsersHarness, transactionWrites, type UsersHarness } from './__tests__/users-harness';

describe('UsersService PATCH', () => {
  describe('PATCH atomicity (M-1)', () => {
    const SIDOROV = { lastName: 'Сидоров' } as const;

    async function seedDoctorOnRole(harness: UsersHarness, practitionerRoleId = 'role-1'): Promise<string> {
      const doctor = await harness.users.create(doctorDto({ email: 'owner@example.by', practitionerRoleId }), ADMIN);
      return doctor.id;
    }

    function auditCount(harness: UsersHarness): number {
      return createdOf(harness.fhir, 'AuditEvent').length;
    }

    it('should leave roles, name and audit untouched when the PractitionerRole is already taken', async () => {
      const harness = createUsersHarness();
      await seedDoctorOnRole(harness);
      const target = await harness.users.create(doctorDto({ email: 'admin2@example.by', roles: [Role.ADMIN] }), ADMIN);
      const audits = auditCount(harness);

      const attempt = harness.users.update(
        target.id,
        { roles: [Role.DOCTOR], ...SIDOROV, practitionerRoleId: 'role-1' },
        ADMIN,
      );

      await expect(attempt).rejects.toThrow('PRACTITIONER_ROLE_TAKEN');
      expect(await harness.store.findById(target.id)).toMatchObject({
        roles: [Role.ADMIN],
        lastName: 'Петров',
        links: {},
      });
      expect(auditCount(harness)).toBe(audits);
      expect(harness.fhir.batch).not.toHaveBeenCalled();
    });

    it('should leave the account untouched when the email is taken by a concurrent change the pre-check missed', async () => {
      const harness = createUsersHarness();
      const userId = await seedPatient(harness);
      await seedPatient(harness, 'taken@example.by');
      jest.spyOn(harness.store, 'findByEmail').mockResolvedValue(null);

      const attempt = harness.users.update(userId, { email: 'taken@example.by', ...SIDOROV }, ADMIN);

      await expect(attempt).rejects.toThrow('EMAIL_TAKEN');
      expect(await harness.store.findById(userId)).toMatchObject({ email: 'ivanov@example.by', lastName: 'Иванов' });
    });

    it('should take the account change back and answer the HAPI error when the Patient sync fails', async () => {
      const harness = createUsersHarness();
      const userId = await seedPatient(harness);
      const audits = auditCount(harness);
      harness.fhir.batch.mockRejectedValueOnce(new FhirClientError('POST', 'http://hapi/', 412));

      const attempt = harness.users.update(userId, { ...SIDOROV, email: 'moved@example.by', isActive: false }, ADMIN);

      await expect(attempt).rejects.toMatchObject({ status: 409 });
      expect(await harness.store.findById(userId)).toMatchObject({
        email: 'ivanov@example.by',
        lastName: 'Иванов',
        isActive: true,
      });
      expect(auditCount(harness)).toBe(audits);
    });

    it('should journal the surviving change as failed when the Patient sync fails and the revert fails too', async () => {
      const harness = createUsersHarness();
      const userId = await seedPatient(harness);
      harness.fhir.batch.mockRejectedValueOnce(new FhirClientError('POST', 'http://hapi/', 503));
      const update = harness.store.update.bind(harness.store);
      jest
        .spyOn(harness.store, 'update')
        .mockImplementationOnce(update)
        .mockRejectedValueOnce(new Error('database went away'));

      await expect(harness.users.update(userId, SIDOROV, ADMIN)).rejects.toMatchObject({ status: 502 });

      expect((await harness.store.findById(userId))?.lastName).toBe('Сидоров');
      expect(createdOf(harness.fhir, 'AuditEvent').at(-1)).toMatchObject({
        action: 'U',
        outcome: '8',
        outcomeDesc: expect.stringContaining('not reverted'),
      });
    });

    it('should answer the timeout and converge when the same PATCH is repeated after HAPI timed out and may have stored the change', async () => {
      const harness = createUsersHarness();
      const userId = await seedPatient(harness);
      harness.fhir.batch.mockRejectedValueOnce(
        new FhirClientError('POST', 'http://hapi/', undefined, undefined, { timedOut: true }),
      );

      await expect(harness.users.update(userId, SIDOROV, ADMIN)).rejects.toMatchObject({ status: 504 });
      await harness.users.update(userId, SIDOROV, ADMIN);

      expect((await harness.store.findById(userId))?.lastName).toBe('Сидоров');
      expect(transactionWrites(harness.fhir).at(-1)?.resource).toMatchObject({ name: [{ family: 'Сидоров' }] });
    });

    it('should not touch HAPI when the change carries nothing the Patient holds', async () => {
      const harness = createUsersHarness();
      const userId = await seedPatient(harness);

      await harness.users.update(userId, { isActive: false }, ADMIN);

      expect(harness.fhir.batch).not.toHaveBeenCalled();
    });

    it('should write one AuditEvent naming the account when a PATCH commits', async () => {
      const harness = createUsersHarness();
      const userId = await seedPatient(harness);
      const audits = auditCount(harness);

      await harness.users.update(userId, SIDOROV, ADMIN);

      expect(auditCount(harness)).toBe(audits + 1);
      expect(createdOf(harness.fhir, 'AuditEvent').at(-1)).toMatchObject({ action: 'U', outcome: '0' });
    });
  });

  describe('releasing a PractitionerRole (m-4)', () => {
    it('should free the PractitionerRole when an admin patches practitionerRoleId to null', async () => {
      const harness = createUsersHarness();
      const doctor = await harness.users.create(doctorDto({ practitionerRoleId: 'role-1' }), ADMIN);

      const released = await harness.users.update(doctor.id, { practitionerRoleId: null }, ADMIN);
      const successor = await harness.users.create(doctorDto({ email: 'next@example.by', practitionerRoleId: 'role-1' }), ADMIN);

      expect(released.practitionerRoleRef).toBeNull();
      expect(successor.practitionerRoleRef).toBe('PractitionerRole/role-1');
    });

    it('should free the PractitionerRole when the account stops being a DOCTOR', async () => {
      const harness = createUsersHarness();
      const doctor = await harness.users.create(doctorDto({ practitionerRoleId: 'role-1' }), ADMIN);

      const demoted = await harness.users.update(doctor.id, { roles: [Role.ADMIN] }, ADMIN);

      expect(demoted.practitionerRoleRef).toBeNull();
      expect((await harness.store.findById(doctor.id))?.links).toEqual({});
    });

    it('should keep the PractitionerRole when a DOCTOR only changes the name', async () => {
      const harness = createUsersHarness();
      const doctor = await harness.users.create(doctorDto({ practitionerRoleId: 'role-1' }), ADMIN);

      const renamed = await harness.users.update(doctor.id, { lastName: 'Сидоров' }, ADMIN);

      expect(renamed.practitionerRoleRef).toBe('PractitionerRole/role-1');
    });

    it('should name the released PractitionerRole in the AuditEvent', async () => {
      const harness = createUsersHarness();
      const doctor = await harness.users.create(doctorDto({ practitionerRoleId: 'role-1' }), ADMIN);

      await harness.users.update(doctor.id, { practitionerRoleId: null }, ADMIN);

      expect(createdOf(harness.fhir, 'AuditEvent').at(-1)).toMatchObject({
        entity: expect.arrayContaining([{ what: { reference: 'PractitionerRole/role-1' } }]),
      });
    });

    it('should accept the release for an account that is no longer a DOCTOR', async () => {
      const harness = createUsersHarness();
      const admin = await harness.users.create(doctorDto({ roles: [Role.ADMIN] }), ADMIN);

      await expect(harness.users.update(admin.id, { practitionerRoleId: null }, ADMIN)).resolves.toMatchObject({
        practitionerRoleRef: null,
      });
    });

    it('should still refuse to link a PractitionerRole to an account that is not a DOCTOR', async () => {
      const harness = createUsersHarness();
      const admin = await harness.users.create(doctorDto({ roles: [Role.ADMIN] }), ADMIN);

      await expect(harness.users.update(admin.id, { practitionerRoleId: 'role-1' }, ADMIN)).rejects.toMatchObject({
        status: 400,
      });
    });
  });
});
