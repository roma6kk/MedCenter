import { Role } from '@medcenter/contracts';

import type { UserRecord } from './store/user-store';
import { toUserDetails, toUserResponse } from './user-view.mapper';

const DOCTOR: UserRecord = {
  id: 'u-1',
  email: 'petrov@example.by',
  passwordHash: 'scrypt$secret',
  firstName: 'Пётр',
  lastName: 'Петров',
  isActive: true,
  roles: [Role.DOCTOR],
  links: { practitionerRoleId: 'role-7' },
  createdAt: new Date('2026-10-01T08:00:00.000Z'),
};

describe('toUserResponse', () => {
  it('should map the API fields and the table helpers when the account is a doctor', () => {
    expect(toUserResponse(DOCTOR)).toEqual({
      id: 'u-1',
      email: 'petrov@example.by',
      firstName: 'Пётр',
      lastName: 'Петров',
      roles: [Role.DOCTOR],
      patientRef: null,
      practitionerRoleRef: 'PractitionerRole/role-7',
      isActive: true,
      name: 'Петров Пётр',
      role: Role.DOCTOR,
    });
  });

  it('should never expose the password hash when a user is mapped', () => {
    expect(JSON.stringify(toUserDetails(DOCTOR))).not.toContain('scrypt$secret');
  });
});

describe('toUserDetails', () => {
  it('should list every ExternalLink as a relative reference when the user has both links', () => {
    const details = toUserDetails({ ...DOCTOR, links: { patientId: 'pat-1', practitionerRoleId: 'role-7' } });

    expect(details.externalLinks).toEqual([
      { resourceType: 'Patient', resourceId: 'pat-1', reference: 'Patient/pat-1' },
      { resourceType: 'PractitionerRole', resourceId: 'role-7', reference: 'PractitionerRole/role-7' },
    ]);
    expect(details.patientRef).toBe('Patient/pat-1');
    expect(details.createdAt).toBe('2026-10-01T08:00:00.000Z');
  });
});
