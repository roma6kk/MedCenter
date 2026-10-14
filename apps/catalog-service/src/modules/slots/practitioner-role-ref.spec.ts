import { ForbiddenException } from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';

import { requirePractitionerRoleId } from './practitioner-role-ref';

function doctorClaims(fhirUser?: string): JwtClaims {
  return {
    sub: 'user-1',
    scope: 'user/*.read user/*.write launch',
    role: 'DOCTOR',
    jti: 'jti-1',
    ...(fhirUser === undefined ? {} : { fhirUser }),
  };
}

function errorCodeOf(claims: JwtClaims): unknown {
  try {
    requirePractitionerRoleId(claims);
  } catch (error: unknown) {
    if (error instanceof ForbiddenException) {
      return (error.getResponse() as { errorCode?: unknown }).errorCode;
    }
    throw error;
  }
  return undefined;
}

describe('requirePractitionerRoleId', () => {
  it('should return the PractitionerRole id when fhirUser is a PractitionerRole reference', () => {
    // Act
    const roleId = requirePractitionerRoleId(doctorClaims('PractitionerRole/role-7'));

    // Assert
    expect(roleId).toBe('role-7');
  });

  it('should fail closed with COMPARTMENT_VIOLATION when fhirUser is absent', () => {
    expect(errorCodeOf(doctorClaims())).toBe('COMPARTMENT_VIOLATION');
  });

  it('should fail closed with COMPARTMENT_VIOLATION when fhirUser is a Patient reference', () => {
    expect(errorCodeOf(doctorClaims('Patient/p-1'))).toBe('COMPARTMENT_VIOLATION');
  });

  it('should fail closed with COMPARTMENT_VIOLATION when fhirUser smuggles extra references', () => {
    // A comma would turn the FHIR `actor` search into an OR over other roles.
    expect(errorCodeOf(doctorClaims('PractitionerRole/role-7,PractitionerRole/role-8'))).toBe(
      'COMPARTMENT_VIOLATION',
    );
  });

  it('should fail closed with COMPARTMENT_VIOLATION when the reference carries no id', () => {
    expect(errorCodeOf(doctorClaims('PractitionerRole/'))).toBe('COMPARTMENT_VIOLATION');
  });

  it('should fail closed with COMPARTMENT_VIOLATION when the id is only dots', () => {
    // `PractitionerRole/..` would widen the `actor` search to an unrelated path.
    expect(errorCodeOf(doctorClaims('PractitionerRole/..'))).toBe('COMPARTMENT_VIOLATION');
  });
});
