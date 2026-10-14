import type { JwtClaims } from '@medcenter/common';

import { isFhirId, patientRefFromClaims, practitionerRoleRefFromClaims } from './claims-identity';

const BASE_CLAIMS: JwtClaims = { sub: 'user-1', scope: 'patient/*.read', role: 'PATIENT', jti: 'jti-1' };

function errorCodeOf(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return (error as { getResponse(): { errorCode?: unknown } }).getResponse().errorCode;
  }
  throw new Error('expected the action to throw');
}

describe('isFhirId', () => {
  it.each(['pat-1', '0b9d9a5e-4f7c-4c1e-9d3a-2f1b8e6c7a10', '1203', 'a.b'])('should accept %s when it follows the R4 id grammar', (id) => {
    expect(isFhirId(id)).toBe(true);
  });

  it.each(['.', '..', '...'])('should reject %s when the id is made of dots only', (id) => {
    expect(isFhirId(id)).toBe(false);
  });

  it.each(['', 'a/b', 'a,b', 'x'.repeat(65)])('should reject %s when it breaks the R4 id grammar', (id) => {
    expect(isFhirId(id)).toBe(false);
  });
});

describe('patientRefFromClaims', () => {
  it('should build the compartment reference when the claim is a bare id', () => {
    expect(patientRefFromClaims({ ...BASE_CLAIMS, patient: 'pat-1' })).toBe('Patient/pat-1');
  });

  it('should accept the Patient/{id} form when the issuer sends a reference', () => {
    expect(patientRefFromClaims({ ...BASE_CLAIMS, patient: 'Patient/pat-1' })).toBe('Patient/pat-1');
  });

  it('should refuse with COMPARTMENT_VIOLATION when the claim is not a FHIR id', () => {
    expect(errorCodeOf(() => patientRefFromClaims({ ...BASE_CLAIMS, patient: '..' }))).toBe('COMPARTMENT_VIOLATION');
  });

  it('should refuse with COMPARTMENT_VIOLATION when the token has no patient context', () => {
    expect(errorCodeOf(() => patientRefFromClaims(BASE_CLAIMS))).toBe('COMPARTMENT_VIOLATION');
  });
});

describe('practitionerRoleRefFromClaims', () => {
  const doctor: JwtClaims = { ...BASE_CLAIMS, role: 'DOCTOR', scope: 'user/*.read' };

  it('should return the PractitionerRole reference when fhirUser carries one', () => {
    expect(practitionerRoleRefFromClaims({ ...doctor, fhirUser: 'PractitionerRole/role-1' })).toBe('PractitionerRole/role-1');
  });

  it.each([undefined, 'Practitioner/p-1', 'Patient/pat-1', 'PractitionerRole/..'])(
    'should fail closed with COMPARTMENT_VIOLATION when fhirUser is %s',
    (fhirUser) => {
      expect(errorCodeOf(() => practitionerRoleRefFromClaims({ ...doctor, fhirUser }))).toBe('COMPARTMENT_VIOLATION');
    },
  );
});
