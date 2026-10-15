import { Role } from '@medcenter/contracts';

import { isRole, primaryRole, restrictScopeToRole, toIdentityClaims } from './identity';

describe('toIdentityClaims', () => {
  it('should emit the bare patient id and a Patient fhirUser when the role is PATIENT', () => {
    const claims = toIdentityClaims({ userId: 'u1', role: Role.PATIENT, patientId: '9f2c' });

    expect(claims).toEqual({ role: Role.PATIENT, patient: '9f2c', fhirUser: 'Patient/9f2c' });
  });

  it('should emit a PractitionerRole fhirUser and no patient when the role is DOCTOR', () => {
    const claims = toIdentityClaims({
      userId: 'u2',
      role: Role.DOCTOR,
      practitionerRoleId: 'role-7',
      patientId: 'also-a-patient',
    });

    expect(claims).toEqual({ role: Role.DOCTOR, fhirUser: 'PractitionerRole/role-7' });
  });

  it('should emit neither patient nor fhirUser when the role is ADMIN', () => {
    expect(toIdentityClaims({ userId: 'u3', role: Role.ADMIN, patientId: 'p' })).toEqual({ role: Role.ADMIN });
  });

  it('should omit fhirUser when a DOCTOR has no PractitionerRole link', () => {
    expect(toIdentityClaims({ userId: 'u4', role: Role.DOCTOR })).toEqual({ role: Role.DOCTOR });
  });
});

describe('restrictScopeToRole', () => {
  const requested = 'launch patient/*.read patient/*.write user/*.read user/*.write offline_access';

  it('should keep only patient scopes when the role is PATIENT', () => {
    expect(restrictScopeToRole(requested, Role.PATIENT)).toBe('launch patient/*.read patient/*.write');
  });

  it('should keep only user scopes when the role is DOCTOR', () => {
    expect(restrictScopeToRole(requested, Role.DOCTOR)).toBe('launch user/*.read user/*.write');
  });

  it('should return an empty scope when nothing requested is allowed for the role', () => {
    expect(restrictScopeToRole('patient/*.read', Role.ADMIN)).toBe('');
  });
});

describe('primaryRole', () => {
  it('should prefer ADMIN over DOCTOR and PATIENT when several roles are held', () => {
    expect(primaryRole([Role.PATIENT, Role.ADMIN, Role.DOCTOR])).toBe(Role.ADMIN);
  });

  it('should return null when the user holds no role', () => {
    expect(primaryRole([])).toBeNull();
  });
});

describe('isRole', () => {
  it('should accept a catalogue role and reject anything else', () => {
    expect(isRole('DOCTOR')).toBe(true);
    expect(isRole('ROOT')).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});
