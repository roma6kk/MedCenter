import { isValidAtcCode } from './atc';
import { isValidIcd10Code } from './icd10';
import { isKnownUcumUnit } from './ucum';
import { FHIR_BY } from '../canonical-urls';

describe('isValidIcd10Code', () => {
  it.each(['J06.9', 'M54.5', 'A00'])('should accept %s', (code) => {
    expect(isValidIcd10Code(code)).toBe(true);
  });

  it.each(['j06.9', 'J6', ''])('should reject %s', (code) => {
    expect(isValidIcd10Code(code)).toBe(false);
  });

  it('should reject an ATC code', () => {
    expect(isValidIcd10Code('J01FA10')).toBe(false);
  });

  it('should reject free text', () => {
    expect(isValidIcd10Code('ОРВИ')).toBe(false);
  });
});

describe('isValidAtcCode', () => {
  it.each(['J01FA10', 'N02BE01'])('should accept %s', (code) => {
    expect(isValidAtcCode(code)).toBe(true);
  });

  it.each(['J01FA1', 'abcde', ''])('should reject %s', (code) => {
    expect(isValidAtcCode(code)).toBe(false);
  });

  it('should reject the 3-character ATC segment', () => {
    expect(isValidAtcCode('N02')).toBe(false);
  });
});

describe('isKnownUcumUnit', () => {
  it('should accept a unit from the closed set', () => {
    expect(isKnownUcumUnit('mmol/L')).toBe(true);
  });

  it('should reject a free-text unit', () => {
    expect(isKnownUcumUnit('горсть')).toBe(false);
  });

  it('should reject the empty string', () => {
    expect(isKnownUcumUnit('')).toBe(false);
  });

  it('should use the expanded set when one is provided', () => {
    expect(isKnownUcumUnit('kcal', new Set(['kcal']))).toBe(true);
    expect(isKnownUcumUnit('mmol/L', new Set(['kcal']))).toBe(false);
  });
});

describe('FHIR_BY', () => {
  it('should expose the fhir.by ICD-10 ValueSet URL', () => {
    expect(FHIR_BY.ICD10_VALUE_SET).toBe('https://fhir.by/ValueSet/InternClassificDiseases10');
  });

  it('should expose the НСИ service CodeSystem URL', () => {
    expect(FHIR_BY.SERVICE_CODE_SYSTEM).toBe('https://fhir.by/CodeSystem/nsi-services');
  });
});
