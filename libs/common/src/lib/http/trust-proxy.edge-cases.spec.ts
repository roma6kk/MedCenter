import { parseTrustProxy } from './trust-proxy';

describe('parseTrustProxy edge cases', () => {
  it.each([
    ['10.0.0.1,'],
    [',10.0.0.1'],
    ['10.0.0.1,,10.0.0.2'],
    [','],
  ])('should reject %p at boot when the list carries an empty entry', (raw) => {
    expect(() => parseTrustProxy(raw)).toThrow('TRUST_PROXY contains an invalid entry');
  });

  it.each([['TRUE'], ['True'], ['FALSE'], ['on'], ['1 hop'], ['auto']])(
    'should reject %p at boot when it is not the literal true, false or a number',
    (raw) => {
      expect(() => parseTrustProxy(raw)).toThrow('TRUST_PROXY contains an invalid entry');
    },
  );

  it('should name the offending entry in the error when one of several is invalid', () => {
    expect(() => parseTrustProxy('loopback, 300.1.1.1')).toThrow('"300.1.1.1"');
  });

  it('should trim blanks around every entry when the list is spaced out', () => {
    expect(parseTrustProxy(' loopback ,  10.0.0.0/8 , 203.0.113.7 ')).toBe('loopback,10.0.0.0/8,203.0.113.7');
  });

  it.each([
    ['0.0.0.0/0', '0.0.0.0/0'],
    ['::1', '::1'],
    ['fc00::/7', 'fc00::/7'],
    ['linklocal,uniquelocal', 'linklocal,uniquelocal'],
  ])('should accept the valid trust entry %p when the proxy is a range or keyword', (raw, expected) => {
    expect(parseTrustProxy(raw)).toBe(expected);
  });

  it('should not read a hop count when digits are mixed with letters', () => {
    expect(() => parseTrustProxy('1a')).toThrow('TRUST_PROXY contains an invalid entry');
  });
});
