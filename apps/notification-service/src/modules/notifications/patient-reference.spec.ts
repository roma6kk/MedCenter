import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { JwtClaims, RequestWithClaims } from '@medcenter/common';

import { FHIR_ID_PATTERN, FhirIdPipe, patientReferenceOf } from './patient-reference';

function requestWith(patient?: string): RequestWithClaims {
  const claims: JwtClaims = {
    sub: 'user-1',
    scope: 'patient/*.read launch',
    role: 'PATIENT',
    jti: 'jti-1',
    ...(patient === undefined ? {} : { patient }),
  };
  return { user: claims };
}

/** The error `act` throws; fails the test when it does not throw. */
function thrownBy(act: () => unknown): unknown {
  try {
    act();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to throw');
}

describe('patientReferenceOf', () => {
  it.each([
    ['9f2c', 'Patient/9f2c'],
    ['0a1b2c3d-0000-4000-8000-000000000001', 'Patient/0a1b2c3d-0000-4000-8000-000000000001'],
    ['pat.1', 'Patient/pat.1'],
  ])('should prefix the resource type when the claim is the bare Patient id %s', (claim, expected) => {
    expect(patientReferenceOf(requestWith(claim))).toBe(expected);
  });

  it('should keep the reference when the claim is already Patient/{id}', () => {
    expect(patientReferenceOf(requestWith('Patient/9f2c'))).toBe('Patient/9f2c');
  });

  it.each([
    ['Practitioner/9f2c'],
    ['Patient/'],
    ['Patient/..'],
    ['Patient/a/b'],
    ['a,b'],
    ['..'],
    ['http://hapi:8080/fhir/Patient/9f2c'],
    ['x'.repeat(65)],
  ])('should refuse with COMPARTMENT_VIOLATION when the claim is %p', (claim) => {
    // Act
    const error = thrownBy(() => patientReferenceOf(requestWith(claim)));

    // Assert
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
  });

  it('should refuse with COMPARTMENT_VIOLATION when the token carries no patient claim', () => {
    expect(() => patientReferenceOf(requestWith())).toThrow(ForbiddenException);
  });

  it('should refuse with 401 when the guard attached no claims', () => {
    expect(() => patientReferenceOf({})).toThrow(UnauthorizedException);
  });
});

describe('FhirIdPipe', () => {
  const pipe = new FhirIdPipe();

  it.each(['c-1', '9f2c', '0a1b2c3d-0000-4000-8000-000000000001', 'a.b', 'x'.repeat(64)])(
    'should pass %s through when it is a FHIR id',
    (id) => {
      expect(pipe.transform(id)).toBe(id);
    },
  );

  it.each(['', 'a,b', '..', '.', 'a b', 'a/b', 'x'.repeat(65)])('should reject %p with VALIDATION_ERROR when it is not a FHIR id', (id) => {
    // Act
    const act = (): string => pipe.transform(id);

    // Assert
    expect(act).toThrow(BadRequestException);
    expect(FHIR_ID_PATTERN.test(id)).toBe(false);
  });
});
