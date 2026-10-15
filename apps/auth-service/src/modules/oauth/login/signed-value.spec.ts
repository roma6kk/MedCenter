import { randomBytes } from 'node:crypto';

import { signValue, verifySignedValue } from './signed-value';

describe('signed values', () => {
  const key = randomBytes(32);

  it('should return the original payload when the value was signed with the same key', () => {
    // Arrange
    const signed = signValue({ sub: 'user-1', exp: 10 }, key);

    // Act
    const payload = verifySignedValue(signed, key);

    // Assert
    expect(payload).toEqual({ sub: 'user-1', exp: 10 });
  });

  it('should return null when the payload was tampered with', () => {
    const signed = signValue({ sub: 'user-1' }, key);
    const [, signature] = signed.split('.');
    const forged = `${Buffer.from(JSON.stringify({ sub: 'admin' })).toString('base64url')}.${signature ?? ''}`;

    expect(verifySignedValue(forged, key)).toBeNull();
  });

  it('should return null when the value was signed with another key', () => {
    const signed = signValue({ sub: 'user-1' }, randomBytes(32));

    expect(verifySignedValue(signed, key)).toBeNull();
  });

  it('should return null when the value is malformed', () => {
    expect(verifySignedValue('', key)).toBeNull();
    expect(verifySignedValue('only-one-part', key)).toBeNull();
    expect(verifySignedValue('a.b.c', key)).toBeNull();
  });
});
