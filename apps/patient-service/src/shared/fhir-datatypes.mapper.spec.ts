import {
  objectsOf,
  readActive,
  readConcepts,
  readDate,
  readGender,
  readIdentifiers,
  readPersonName,
  readTelecom,
} from './fhir-datatypes.mapper';

describe('objectsOf', () => {
  it('should keep only JSON objects when the array mixes objects and scalars', () => {
    expect(objectsOf([{ value: 'a' }, 'b', null, 3, [1]])).toEqual([{ value: 'a' }]);
  });

  it('should return an empty list when the value is not an array', () => {
    expect(objectsOf({ value: 'a' })).toEqual([]);
  });
});

describe('readPersonName', () => {
  it('should prefer the official name when official and usual names are both present', () => {
    const name = readPersonName([
      { use: 'usual', family: 'Обычная', given: ['Анна'] },
      { use: 'official', family: 'Официальная', given: ['Анна'] },
    ]);

    expect(name.lastName).toBe('Официальная');
  });

  it('should prefer the usual name when there is no official name', () => {
    const name = readPersonName([
      { family: 'Первая', given: ['Запись'] },
      { use: 'usual', family: 'Обычная', given: ['Анна'] },
    ]);

    expect(name.lastName).toBe('Обычная');
  });

  it('should skip non-string given parts when the HumanName is malformed', () => {
    const name = readPersonName([{ family: 'Иванов', given: [42, 'Иван'] }]);

    expect(name).toEqual({ fullName: 'Иванов Иван', lastName: 'Иванов', firstName: 'Иван' });
  });

  it('should compose the full name from given parts when the family name is absent', () => {
    expect(readPersonName([{ given: ['Иван', 'Петрович'] }])).toEqual({
      fullName: 'Иван Петрович',
      lastName: '',
      firstName: 'Иван',
      middleName: 'Петрович',
    });
  });

  it('should return empty names when every name is marked old', () => {
    expect(readPersonName([{ use: 'old', family: 'Старая' }])).toEqual({ fullName: '', lastName: '', firstName: '' });
  });

  it('should return empty names when the name element is not an array', () => {
    expect(readPersonName('Иванов')).toEqual({ fullName: '', lastName: '', firstName: '' });
  });
});

describe('readGender', () => {
  it.each(['male', 'female', 'other', 'unknown'])('should keep %s when it belongs to AdministrativeGender', (gender) => {
    expect(readGender(gender)).toBe(gender);
  });

  it.each(['M', 'FEMALE', '', 1])('should drop %p when it is outside AdministrativeGender', (gender) => {
    expect(readGender(gender)).toBeUndefined();
  });
});

describe('readTelecom', () => {
  it('should default the system to other when the ContactPoint has none', () => {
    expect(readTelecom([{ value: '+375291234567' }])).toEqual([{ system: 'other', value: '+375291234567' }]);
  });

  it('should drop a ContactPoint when it has no value or is marked old', () => {
    const telecom = readTelecom([
      { system: 'phone' },
      { system: 'phone', value: '' },
      { system: 'phone', value: '+375170000000', use: 'old' },
      { system: 'email', value: 'a@example.by', use: 'home' },
    ]);

    expect(telecom).toEqual([{ system: 'email', value: 'a@example.by', use: 'home' }]);
  });
});

describe('readIdentifiers', () => {
  it('should drop identifiers when they have no value or are marked old', () => {
    const identifiers = readIdentifiers([
      { system: 'https://fhir.by/sid/personal-number' },
      { use: 'old', system: 'https://fhir.by/sid/personal-number', value: 'OLD-1' },
      { value: 'MRN-7' },
    ]);

    expect(identifiers).toEqual([{ value: 'MRN-7' }]);
  });
});

describe('readConcepts', () => {
  it('should prefer the concept text when both text and coding display are present', () => {
    const concepts = readConcepts([{ coding: [{ code: 'MTH', display: 'mother' }], text: 'Мать' }]);

    expect(concepts).toEqual([{ code: 'MTH', display: 'Мать' }]);
  });

  it('should fall back to the coding display when the concept has no text', () => {
    const concepts = readConcepts([{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode', code: 'FTH', display: 'father' }] }]);

    expect(concepts).toEqual([{ system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode', code: 'FTH', display: 'father' }]);
  });

  it('should fall back to the code when neither text nor display is present', () => {
    expect(readConcepts([{ coding: [{ code: 'SIS' }] }])).toEqual([{ code: 'SIS', display: 'SIS' }]);
  });

  it('should keep a text-only concept when it has no coding', () => {
    expect(readConcepts([{ text: 'Опекун' }])).toEqual([{ display: 'Опекун' }]);
  });

  it('should drop a concept when it carries no text, display or code', () => {
    expect(readConcepts([{ coding: [{ system: 'urn:x' }] }])).toEqual([]);
  });
});

describe('readDate', () => {
  it('should keep a partial FHIR date when the value is a year-month', () => {
    expect(readDate('1990-05')).toBe('1990-05');
  });

  it('should return undefined when the value is empty or not a string', () => {
    expect([readDate(''), readDate(19900512)]).toEqual([undefined, undefined]);
  });
});

describe('readActive', () => {
  it('should treat the record as active when the active flag is absent', () => {
    expect(readActive(undefined)).toBe(true);
  });

  it('should treat the record as inactive when the active flag is false', () => {
    expect(readActive(false)).toBe(false);
  });
});
