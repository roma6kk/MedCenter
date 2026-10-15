import { Role } from '@medcenter/contracts';

import { changesOf, demographicsOf, inverseOf } from './user-changes';
import type { UserRecord } from './store/user-store';

const DOCTOR: UserRecord = {
  id: 'user-1',
  email: 'petrov@example.by',
  passwordHash: 'scrypt$hash',
  firstName: 'Пётр',
  lastName: 'Петров',
  isActive: true,
  roles: [Role.DOCTOR],
  links: { practitionerRoleId: 'role-1' },
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

describe('changesOf', () => {
  it('should normalise the email and de-duplicate the roles when a PATCH carries them', () => {
    const changes = changesOf({ email: 'Petrov@Example.BY', roles: [Role.DOCTOR, Role.DOCTOR] }, DOCTOR);

    expect(changes).toEqual({ email: 'petrov@example.by', roles: [Role.DOCTOR] });
  });

  it('should carry only the fields that are present when a PATCH names one', () => {
    expect(changesOf({ lastName: 'Сидоров' }, DOCTOR)).toEqual({ lastName: 'Сидоров' });
  });

  it('should pass an explicit practitionerRoleId null through as a release', () => {
    expect(changesOf({ practitionerRoleId: null }, DOCTOR)).toEqual({ practitionerRoleId: null });
  });

  it('should release the PractitionerRole when the new role set has no DOCTOR', () => {
    expect(changesOf({ roles: [Role.ADMIN] }, DOCTOR)).toEqual({ roles: [Role.ADMIN], practitionerRoleId: null });
  });

  it('should keep the PractitionerRole when the new role set still has DOCTOR', () => {
    expect(changesOf({ roles: [Role.DOCTOR, Role.ADMIN] }, DOCTOR)).toEqual({ roles: [Role.DOCTOR, Role.ADMIN] });
  });

  it('should not invent a release when the account holds no PractitionerRole', () => {
    expect(changesOf({ roles: [Role.ADMIN] }, { ...DOCTOR, links: {} })).toEqual({ roles: [Role.ADMIN] });
  });

  it('should prefer the explicit practitionerRoleId over the implicit release', () => {
    expect(changesOf({ roles: [Role.DOCTOR], practitionerRoleId: 'role-2' }, DOCTOR)).toEqual({
      roles: [Role.DOCTOR],
      practitionerRoleId: 'role-2',
    });
  });
});

describe('demographicsOf', () => {
  it('should return null when a PATCH touches nothing the Patient holds', () => {
    expect(demographicsOf({ isActive: false, roles: [Role.ADMIN], practitionerRoleId: 'role-1' })).toBeNull();
  });

  it('should return the normalised email with the name, birth date and gender when they are patched', () => {
    expect(
      demographicsOf({ email: 'New@Example.by', firstName: 'А', lastName: 'Б', birthDate: '1990-01-01', gender: 'female' }),
    ).toEqual({ email: 'new@example.by', firstName: 'А', lastName: 'Б', birthDate: '1990-01-01', gender: 'female' });
  });
});

describe('inverseOf', () => {
  it('should restore exactly the fields the change touched', () => {
    const changes = { email: 'x@example.by', lastName: 'Сидоров', isActive: false, roles: [Role.ADMIN] };

    expect(inverseOf(DOCTOR, changes)).toEqual({
      email: 'petrov@example.by',
      lastName: 'Петров',
      isActive: true,
      roles: [Role.DOCTOR],
    });
  });

  it('should put the previous PractitionerRole back when the change released or replaced it', () => {
    expect(inverseOf(DOCTOR, { practitionerRoleId: null })).toEqual({ practitionerRoleId: 'role-1' });
    expect(inverseOf(DOCTOR, { practitionerRoleId: 'role-2' })).toEqual({ practitionerRoleId: 'role-1' });
  });

  it('should release the link again when the account had none before the change', () => {
    expect(inverseOf({ ...DOCTOR, links: {} }, { practitionerRoleId: 'role-2' })).toEqual({ practitionerRoleId: null });
  });
});
