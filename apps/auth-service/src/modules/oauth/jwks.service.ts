import { Inject, Injectable } from '@nestjs/common';
import { createPublicKey, type JsonWebKey } from 'node:crypto';

import { SIGNING_KEYS, type SigningKeys } from './jwt.service';

export interface JwksDocument {
  readonly keys: ReadonlyArray<JsonWebKey>;
}

@Injectable()
export class JwksService {
  constructor(@Inject(SIGNING_KEYS) private readonly keys: SigningKeys) {}

  getPublicJwks(): JwksDocument {
    const jwk = createPublicKey(this.keys.publicKeyPem).export({ format: 'jwk' });

    return { keys: [{ ...jwk, kid: this.keys.kid, alg: 'RS256', use: 'sig' }] };
  }
}
