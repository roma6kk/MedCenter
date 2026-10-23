import { BELARUS_PHONE_PATTERN, normaliseBelarusPhone } from './phone';

describe('normaliseBelarusPhone', () => {
  it.each([
    ['+375291234567', '+375291234567'],
    ['+375 29 123-45-67', '+375291234567'],
    ['+375 (29) 123 45 67', '+375291234567'],
    ['  +375-17-123-45-67 ', '+375171234567'],
  ])('should normalise %s to %s when it is a Belarus number', (input, expected) => {
    expect(normaliseBelarusPhone(input)).toBe(expected);
  });

  it.each(['', '   ', '291234567', '375291234567', '+37529123456', '+3752912345678', '+7 912 345 67 89', '+375 29 12a 45 67', '++375291234567'])(
    'should return null when %p is not +375 and nine digits',
    (input) => {
      expect(normaliseBelarusPhone(input)).toBeNull();
    },
  );

  it('should expose a pattern that matches only the normalised form', () => {
    expect(BELARUS_PHONE_PATTERN.test('+375291234567')).toBe(true);
    expect(BELARUS_PHONE_PATTERN.test('+375 29 1234567')).toBe(false);
  });
});
