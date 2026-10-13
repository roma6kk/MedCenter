import { ForbiddenException } from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';

import { isFhirId, ownPatientId, practitionerRoleIdOf, referencesResource } from './patient-identity';

const baseClaims: JwtClaims = { sub: 'user-1', scope: 'patient/*.read', role: 'PATIENT', jti: 'jti-1' };

/** Error payload (`{ errorCode, message }`) of a synchronous throw. */
function payloadOf(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return (error as ForbiddenException).getResponse();
  }
  throw new Error('expected the action to throw');
}

describe('ownPatientId', () => {
  it('should return the bare id when the patient claim is a bare id', () => {
    // Arrange
    const claims: JwtClaims = { ...baseClaims, patient: '9f2c' };

    // Act
    const id = ownPatientId(claims);

    // Assert
    expect(id).toBe('9f2c');
  });

  it('should strip the resource type when the patient claim is a Patient reference', () => {
    const claims: JwtClaims = { ...baseClaims, patient: 'Patient/9f2c' };

    expect(ownPatientId(claims)).toBe('9f2c');
  });

  it('should throw COMPARTMENT_VIOLATION when the token carries no patient claim', () => {
    expect(payloadOf(() => ownPatientId(baseClaims))).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
  });

  it('should throw COMPARTMENT_VIOLATION when the patient claim references another resource type', () => {
    const claims: JwtClaims = { ...baseClaims, patient: 'Practitioner/9f2c' };

    expect(payloadOf(() => ownPatientId(claims))).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
  });

  it('should throw COMPARTMENT_VIOLATION when the patient claim is not a valid FHIR id', () => {
    const claims: JwtClaims = { ...baseClaims, patient: '9f2c?_id=other' };

    expect(payloadOf(() => ownPatientId(claims))).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
  });

  it.each(['Patient/..', 'Patient/', '9f2c,other'])(
    'should throw COMPARTMENT_VIOLATION when the patient claim %s cannot name one Patient',
    (patient) => {
      expect(payloadOf(() => ownPatientId({ ...baseClaims, patient }))).toMatchObject({
        errorCode: 'COMPARTMENT_VIOLATION',
      });
    },
  );
});

describe('practitionerRoleIdOf', () => {
  it('should return the PractitionerRole id when fhirUser is a PractitionerRole reference', () => {
    const claims: JwtClaims = { ...baseClaims, role: 'DOCTOR', fhirUser: 'PractitionerRole/role-1' };

    expect(practitionerRoleIdOf(claims)).toBe('role-1');
  });

  it('should fail closed with COMPARTMENT_VIOLATION when fhirUser is absent', () => {
    const claims: JwtClaims = { ...baseClaims, role: 'DOCTOR' };

    expect(payloadOf(() => practitionerRoleIdOf(claims))).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
  });

  it('should fail closed with COMPARTMENT_VIOLATION when fhirUser is not a PractitionerRole reference', () => {
    const claims: JwtClaims = { ...baseClaims, role: 'DOCTOR', fhirUser: 'Practitioner/doc-1' };

    expect(payloadOf(() => practitionerRoleIdOf(claims))).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
  });

  it.each(['PractitionerRole/', 'PractitionerRole/role-1,role-2', 'PractitionerRole/role-1/_history/2'])(
    'should fail closed with COMPARTMENT_VIOLATION when fhirUser %s carries no single PractitionerRole id',
    (fhirUser) => {
      const claims: JwtClaims = { ...baseClaims, role: 'DOCTOR', fhirUser };

      expect(payloadOf(() => practitionerRoleIdOf(claims))).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
    },
  );
});

describe('isFhirId', () => {
  it('should accept a server-assigned numeric id when validating', () => {
    expect(isFhirId('1052')).toBe(true);
  });

  it('should reject an id longer than 64 characters when validating', () => {
    expect(isFhirId('a'.repeat(65))).toBe(false);
  });

  it('should reject an id carrying a path separator when validating', () => {
    expect(isFhirId('9f2c/_history/1')).toBe(false);
  });

  it.each(['.', '..', '...'])('should reject the dot-only id %s when validating', (id) => {
    expect(isFhirId(id)).toBe(false);
  });

  it('should accept an id that contains dots between other characters when validating', () => {
    expect(isFhirId('patient.v2-1')).toBe(true);
  });
});

describe('referencesResource', () => {
  it('should match a relative reference when type and id are equal', () => {
    expect(referencesResource('Patient/9f2c', 'Patient', '9f2c')).toBe(true);
  });

  it('should match an absolute reference when it ends with the type and id', () => {
    expect(referencesResource('http://hapi:8080/fhir/Patient/9f2c', 'Patient', '9f2c')).toBe(true);
  });

  it('should not match when only the id suffix is equal', () => {
    expect(referencesResource('Patient/19f2c', 'Patient', '9f2c')).toBe(false);
  });

  it('should not match when the reference is not a string', () => {
    expect(referencesResource(undefined, 'Patient', '9f2c')).toBe(false);
  });

  it('should not match when the reference names another resource type with the same id', () => {
    expect(referencesResource('Practitioner/role-1', 'PractitionerRole', 'role-1')).toBe(false);
  });
});
