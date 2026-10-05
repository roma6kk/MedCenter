import { hasScope, resolvePatientRef, type JwtClaims } from './request-context';

describe('resolvePatientRef', () => {
  it('should return the patientRef from JWT context for a patient-scope token', () => {
    const claims: JwtClaims = {
      sub: 'u1',
      scope: 'patient/*.read',
      role: 'PATIENT',
      patient: 'Patient/9f2c',
      jti: 'j1',
    };

    expect(resolvePatientRef(claims)).toBe('Patient/9f2c');
  });

  it('should return null when a patient-scope token carries no patient claim', () => {
    const claims: JwtClaims = { sub: 'u1', scope: 'patient/*.read', role: 'PATIENT', jti: 'j1' };

    expect(resolvePatientRef(claims)).toBeNull();
  });
});

describe('hasScope', () => {
  it('should return true when the granted scope list contains the required scope', () => {
    const claims: JwtClaims = {
      sub: 'u1',
      scope: 'patient/*.read launch',
      role: 'PATIENT',
      jti: 'j1',
    };

    expect(hasScope(claims, 'launch')).toBe(true);
  });

  it('should return false when the required scope is absent', () => {
    const claims: JwtClaims = { sub: 'u1', scope: 'patient/*.read', role: 'PATIENT', jti: 'j1' };

    expect(hasScope(claims, 'user/*.write')).toBe(false);
  });
});
