import { ForbiddenException } from '@nestjs/common';
import { FHIR_ID_PATTERN, type JwtClaims } from '@medcenter/common';

import { parseReference, referenceId, requirePatientReference, toPatientReference } from './fhir-reference';

const patient: JwtClaims = { sub: 'user-1', scope: 'patient/*.read', role: 'PATIENT', patient: '9f2c', jti: 'jti-1' };

describe('parseReference', () => {
  it('should parse type and id when the reference is relative', () => {
    const reference = 'PractitionerRole/role-1';

    const parsed = parseReference(reference);

    expect(parsed).toEqual({ type: 'PractitionerRole', id: 'role-1' });
  });

  it('should drop the base URL and version when the reference is absolute and versioned', () => {
    const reference = 'http://hapi:8080/fhir/Patient/9f2c/_history/3';

    const parsed = parseReference(reference);

    expect(parsed).toEqual({ type: 'Patient', id: '9f2c' });
  });

  it('should return undefined when the value is not a reference', () => {
    const values: readonly unknown[] = [undefined, 42, '', '9f2c', 'Patient/', 'Patient/a,b', 'Slot/.', 'Slot/..'];

    const parsed = values.map((value) => parseReference(value));

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
    expect(FHIR_ID_PATTERN.test(id)).toBe(false);
  });
});

describe('toPatientReference', () => {
  it('should prefix the resource type when the claim is a bare Patient id', () => {
    const claim = '9f2c';

    const reference = toPatientReference(claim);

    expect(reference).toBe('Patient/9f2c');
  });

  it('should keep the reference when the claim is already Patient/{id}', () => {
    const claim = 'Patient/9f2c';

    const reference = toPatientReference(claim);

    expect(reference).toBe('Patient/9f2c');
  });

  it('should refuse with COMPARTMENT_VIOLATION when the claim names another resource type', () => {
    const claim = 'Practitioner/9f2c';

    const act = (): string => toPatientReference(claim);

    expect(act).toThrow(ForbiddenException);
  });

  it('should refuse with COMPARTMENT_VIOLATION when the claim is a dot-only id', () => {
    const claim = '..';

    const act = (): string => toPatientReference(claim);

    expect(act).toThrow(ForbiddenException);
  });

  it('should refuse with COMPARTMENT_VIOLATION when the claim is not a FHIR id', () => {
    const claim = '9f2c,other';

    const act = (): string => toPatientReference(claim);

    expect(act).toThrow(ForbiddenException);
  });
});

describe('requirePatientReference', () => {
  it('should return Patient/{id} when the token carries a bare patient claim', () => {
    const claims = patient;

    const reference = requirePatientReference(claims);

    expect(reference).toBe('Patient/9f2c');
  });

  it('should refuse when the token carries no patient claim', () => {
    const claims: JwtClaims = { ...patient, patient: undefined };

    const act = (): string => requirePatientReference(claims);

    expect(act).toThrow(ForbiddenException);
  });
});

describe('referenceId', () => {
  it('should return the logical id when the reference is relative', () => {
    const reference = 'Slot/slot-1';

    const id = referenceId(reference);

    expect(id).toBe('slot-1');
  });

  it('should return the logical id, not the version, when the reference is versioned', () => {
    const reference = 'Slot/slot-1/_history/4';

    const id = referenceId(reference);

    expect(id).toBe('slot-1');
  });

  it('should return an empty id when the value is not a reference', () => {
    const values: readonly unknown[] = [undefined, 42, '', 'not a reference'];

    const ids = values.map(referenceId);

    expect(ids).toEqual(['', '', '', '']);
  });
});
