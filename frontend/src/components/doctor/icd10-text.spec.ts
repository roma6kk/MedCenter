import { codeOfTypedText, formatDiagnosis, upperCaseCode, upperCaseSearch } from './icd10-text';

describe('icd10-text', () => {
  it('should upper-case what looks like a code and leave a name alone', () => {
    expect(upperCaseCode('j06.9')).toBe('J06.9');
    expect(upperCaseCode('насморк')).toBe('насморк');
  });

  it('should upper-case a search only while it is a code, never a whole line that merely starts like one', () => {
    expect(upperCaseSearch('j06.')).toBe('J06.');
    expect(upperCaseSearch('j')).toBe('J');
    expect(upperCaseSearch('J06.9 — Острая инфекция')).toBe('J06.9 — Острая инфекция');
    expect(upperCaseSearch('j06 острая')).toBe('j06 острая');
  });

  it('should show the code with its name once the name is known', () => {
    expect(formatDiagnosis('J06.9', 'Острая инфекция')).toBe('J06.9 — Острая инфекция');
    expect(formatDiagnosis('J06.9', '')).toBe('J06.9');
    expect(formatDiagnosis('', 'stale')).toBe('');
  });

  it('should take a code written out in full as the code and a search as no code', () => {
    expect(codeOfTypedText('j06.9')).toBe('J06.9');
    expect(codeOfTypedText(' J06 ')).toBe('J06');
    expect(codeOfTypedText('J06.')).toBe('');
    expect(codeOfTypedText('ОРВИ')).toBe('');
    expect(codeOfTypedText('')).toBe('');
  });
});
