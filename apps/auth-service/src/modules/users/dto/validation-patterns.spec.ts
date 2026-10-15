import { DATE_ONLY_PATTERN, FHIR_ID_PATTERN } from './validation-patterns';

describe('FHIR_ID_PATTERN', () => {
  it.each(['role-7', '1455', 'a.b-c', 'A'.repeat(64)])('should accept %s', (id) => {
    expect(FHIR_ID_PATTERN.test(id)).toBe(true);
  });

  it.each(['.', '..', '...', '', 'a/b', 'a b', 'A'.repeat(65), 'роль'])('should reject %j', (id) => {
    expect(FHIR_ID_PATTERN.test(id)).toBe(false);
  });
});

describe('DATE_ONLY_PATTERN', () => {
  it('should accept an R4 date and reject a timestamp', () => {
    expect(DATE_ONLY_PATTERN.test('1990-05-12')).toBe(true);
    expect(DATE_ONLY_PATTERN.test('1990-05-12T00:00:00Z')).toBe(false);
  });
});
