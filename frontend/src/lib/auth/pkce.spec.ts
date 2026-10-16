/** @jest-environment node */
import { base64Url, challengeFor, createPkcePair, createState } from './pkce';

describe('pkce', () => {
  it('should derive the S256 challenge of the RFC 7636 appendix B test vector', async () => {
    const challenge = await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');

    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('should create a verifier whose challenge matches and that uses only the unreserved alphabet', async () => {
    const { verifier, challenge } = await createPkcePair();

    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await challengeFor(verifier)).toBe(challenge);
  });

  it('should create a different verifier and state on every call', async () => {
    const first = await createPkcePair();
    const second = await createPkcePair();

    expect(first.verifier).not.toBe(second.verifier);
    expect(createState()).not.toBe(createState());
  });

  it('should encode bytes as unpadded base64url', () => {
    expect(base64Url(new Uint8Array([251, 255, 254]))).toBe('-__-');
  });
});
