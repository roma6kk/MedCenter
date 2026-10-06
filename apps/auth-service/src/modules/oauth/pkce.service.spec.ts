import { createHash } from 'node:crypto';

import { PkceService } from './pkce.service';

function challengeOf(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest('base64url');
}

describe('PkceService', () => {
  const service = new PkceService();

  it('should accept a verifier matching the stored S256 challenge', () => {
    const codeVerifier = 'a'.repeat(64);

    expect(service.verify(challengeOf(codeVerifier), codeVerifier)).toBe(true);
  });

  it('should reject a verifier that does not match the stored challenge', () => {
    const storedChallenge = challengeOf('a'.repeat(64));

    expect(service.verify(storedChallenge, 'b'.repeat(64))).toBe(false);
  });

  it('should reject a challenge of a different length without throwing', () => {
    expect(service.verify('too-short', 'a'.repeat(64))).toBe(false);
  });

  it('should generate a verifier whose derived challenge verifies', () => {
    const pair = service.generate();

    expect(pair.codeChallenge).toBe(service.challenge(pair.codeVerifier));
    expect(service.verify(pair.codeChallenge, pair.codeVerifier)).toBe(true);
  });

  it('should generate a fresh verifier for every authorization request', () => {
    expect(service.generate().codeVerifier).not.toBe(service.generate().codeVerifier);
  });
});
