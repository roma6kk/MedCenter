import { Inject, Injectable } from '@nestjs/common';
import { createPublicKey, type JsonWebKey } from 'node:crypto';

import { SIGNING_KEYS, type SigningKeys } from './jwt.service';

export interface JwksDocument {
  readonly keys: ReadonlyArray<JsonWebKey>;
}

/**
 * Publishes the RS256 public key at `GET /.well-known/jwks.json` (API 2.1.5)
 * so every BFF service verifies tokens locally through `libs/common`.
 */
@Injectable()
export class JwksService {
  constructor(@Inject(SIGNING_KEYS) private readonly keys: SigningKeys) {}

  getPublicJwks(): JwksDocument {
    const jwk = createPublicKey(this.keys.publicKeyPem).export({ format: 'jwk' });

    return { keys: [{ ...jwk, kid: this.keys.kid, alg: 'RS256', use: 'sig' }] };
  }
}
