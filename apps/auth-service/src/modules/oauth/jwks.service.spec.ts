import { JwksService } from './jwks.service';
import { createTestKeys } from './__tests__/test-keys';

// A JWKS key entry carries the advertised fields plus the raw JWK parts.
// We only read the advertised fields (kid, alg, use) and assert that the
// private key material (d, p, q, dp, dq, qi) is absent.
interface PublicJwksKey {
  readonly kid: string;
  readonly alg: string;
  readonly use: string;
  readonly n?: string;
  readonly e?: string;
  readonly d?: string;
  readonly p?: string;
  readonly q?: string;
  readonly dp?: string;
  readonly dq?: string;
  readonly qi?: string;
}

/** Narrow a JWKS key entry to the fields JwksService advertises. */
function asPubKey(entry: unknown): PublicJwksKey {
  return entry as PublicJwksKey;
}

describe('JwksService', () => {
  const keys = createTestKeys();
  const service = new JwksService(keys);

  it('should publish a single RS256 key with the configured kid', () => {
    const jwks = service.getPublicJwks();

    expect(jwks.keys).toHaveLength(1);
    const [publicKeyEntry] = jwks.keys.map(asPubKey);

    expect(publicKeyEntry.kid).toBe(keys.kid);
    expect(publicKeyEntry.alg).toBe('RS256');
    expect(publicKeyEntry.use).toBe('sig');
  });

  it('should include the issuer in the JWKS document metadata', () => {
    const jwks = service.getPublicJwks();

    expect(jwks.keys[0]['kid']).toBe(keys.kid);
  });

  it('should export the public key without the private key material', () => {
    const jwks = service.getPublicJwks();
    const entries = jwks.keys.map(asPubKey);

    for (const key of entries) {
      expect(key.d).toBeUndefined();
      expect(key.p).toBeUndefined();
      expect(key.q).toBeUndefined();
      expect(key.dp).toBeUndefined();
      expect(key.dq).toBeUndefined();
      expect(key.qi).toBeUndefined();
    }
  });
});
