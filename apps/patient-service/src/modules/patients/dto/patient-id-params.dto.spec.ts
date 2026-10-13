import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { PatientIdParamsDto } from './patient-id-params.dto';

function invalidPropertiesOf(plain: Record<string, unknown>): string[] {
  return validateSync(plainToInstance(PatientIdParamsDto, plain)).map((error) => error.property);
}

describe('PatientIdParamsDto', () => {
  it('should accept a UUID id when validating', () => {
    expect(invalidPropertiesOf({ id: '7c9e6679-7425-40de-944b-e07fc1f90ae7' })).toEqual([]);
  });

  it('should accept a HAPI numeric id when validating', () => {
    expect(invalidPropertiesOf({ id: '1052' })).toEqual([]);
  });

  it('should reject an id with characters outside the FHIR id alphabet when validating', () => {
    expect(invalidPropertiesOf({ id: '9f2c,other' })).toEqual(['id']);
  });

  it('should reject a dot-only id when the path segment would collapse the FHIR URL', () => {
    expect(invalidPropertiesOf({ id: '..' })).toEqual(['id']);
  });

  it('should reject a missing id when validating', () => {
    expect(invalidPropertiesOf({})).toEqual(['id']);
  });

  it('should accept a 64-character id when it is at the R4 length limit', () => {
    expect(invalidPropertiesOf({ id: 'a'.repeat(64) })).toEqual([]);
  });

  it.each(['a'.repeat(65), '9f2c?_id=other', '9f2c&_count=1000', '9f2c/_history/1', ''])(
    'should reject %p when it is not a FHIR R4 id',
    (id) => {
      expect(invalidPropertiesOf({ id })).toEqual(['id']);
    },
  );
});
