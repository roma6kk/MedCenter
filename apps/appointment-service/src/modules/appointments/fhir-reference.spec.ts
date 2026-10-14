import { ForbiddenException } from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';

import { FHIR_ID_PATTERN, parseReference, requirePatientReference, toPatientReference } from './fhir-reference';

const patient: JwtClaims = { sub: 'user-1', scope: 'patient/*.read', role: 'PATIENT', patient: '9f2c', jti: 'jti-1' };

describe('parseReference', () => {
  it('should parse type and id when the reference is relative', () => {
    // Arrange
    const reference = 'PractitionerRole/role-1';

    // Act
    const parsed = parseReference(reference);

    // Assert
    expect(parsed).toEqual({ type: 'PractitionerRole', id: 'role-1' });
  });

  it('should drop the base URL and version when the reference is absolute and versioned', () => {
    // Arrange
    const reference = 'http://hapi:8080/fhir/Patient/9f2c/_history/3';

    // Act
    const parsed = parseReference(reference);

    // Assert
    expect(parsed).toEqual({ type: 'Patient', id: '9f2c' });
  });

  it('should return undefined when the value is not a reference', () => {
    // Arrange
    const values: readonly unknown[] = [undefined, 42, '', '9f2c', 'Patient/', 'Patient/a,b', 'Slot/.', 'Slot/..'];

    // Act
    const parsed = values.map((value) => parseReference(value));

    // Assert
    expect(parsed).toEqual(values.map(() => undefined));
  });
});

describe('FHIR_ID_PATTERN', () => {
  it.each(['9f2c', '1001', 'a3f1c9e07b2d', '7c9e6679-7425-40de-944b-e07fc1f90ae7', 'a.b', '.a', 'a..'])(
    'should accept %s when it is a FHIR id',
    (id) => {
      expect(FHIR_ID_PATTERN.test(id)).toBe(true);
    },
  );

  it.each(['', '.', '..', '...', 'a,b', 'a/b', 'a b', 'x'.repeat(65)])('should reject %j when it is not a usable FHIR id', (id) => {
    // Dot-only ids collapse `Slot/{id}` into `Slot/` or the server base as a URL path segment.
    expect(FHIR_ID_PATTERN.test(id)).toBe(false);
  });
});

describe('toPatientReference', () => {
  it('should prefix the resource type when the claim is a bare Patient id', () => {
    // Arrange
    const claim = '9f2c';

    // Act
    const reference = toPatientReference(claim);

    // Assert
    expect(reference).toBe('Patient/9f2c');
  });

  it('should keep the reference when the claim is already Patient/{id}', () => {
    // Arrange
    const claim = 'Patient/9f2c';

    // Act
    const reference = toPatientReference(claim);

    // Assert
    expect(reference).toBe('Patient/9f2c');
  });

  it('should refuse with COMPARTMENT_VIOLATION when the claim names another resource type', () => {
    // Arrange
    const claim = 'Practitioner/9f2c';

    // Act
    const act = (): string => toPatientReference(claim);

    // Assert
    expect(act).toThrow(ForbiddenException);
  });

  it('should refuse with COMPARTMENT_VIOLATION when the claim is a dot-only id', () => {
    // Arrange
    const claim = '..';

    // Act
    const act = (): string => toPatientReference(claim);

    // Assert
    expect(act).toThrow(ForbiddenException);
  });

  it('should refuse with COMPARTMENT_VIOLATION when the claim is not a FHIR id', () => {
    // Arrange
    const claim = '9f2c,other';

    // Act
    const act = (): string => toPatientReference(claim);

    // Assert
    expect(act).toThrow(ForbiddenException);
  });
});

describe('requirePatientReference', () => {
  it('should return Patient/{id} when the token carries a bare patient claim', () => {
    // Arrange
    const claims = patient;

    // Act
    const reference = requirePatientReference(claims);

    // Assert
    expect(reference).toBe('Patient/9f2c');
  });

  it('should refuse when the token carries no patient claim', () => {
    // Arrange
    const claims: JwtClaims = { ...patient, patient: undefined };

    // Act
    const act = (): string => requirePatientReference(claims);

    // Assert
    expect(act).toThrow(ForbiddenException);
  });
});
