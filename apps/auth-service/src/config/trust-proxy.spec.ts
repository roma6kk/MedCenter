import { parseTrustProxy } from './trust-proxy';

describe('parseTrustProxy', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['   ', false],
    ['false', false],
    ['true', true],
    ['0', 0],
    ['1', 1],
    [' 2 ', 2],
    ['10.0.0.0/8', '10.0.0.0/8'],
    ['203.0.113.7', '203.0.113.7'],
    ['2001:db8::/32', '2001:db8::/32'],
    ['loopback, 10.0.0.0/8', 'loopback,10.0.0.0/8'],
    ['uniquelocal', 'uniquelocal'],
  ])('should map %p to %p', (raw, expected) => {
    expect(parseTrustProxy(raw)).toBe(expected);
  });

  it.each([
    ['yes'],
    ['-1'],
    ['1.5'],
    ['10.0.0.0/33'],
    ['2001:db8::/129'],
    ['10.0.0.999'],
    ['10.0.0.0/8/8'],
    ['10.0.0.0/'],
    ['loopback,not-an-ip'],
  ])('should reject %p at boot', (raw) => {
    expect(() => parseTrustProxy(raw)).toThrow('TRUST_PROXY contains an invalid entry');
  });
});
