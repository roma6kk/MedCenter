import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export interface PkcePair {
  readonly codeVerifier: string;
  readonly codeChallenge: string;
}

@Injectable()
export class PkceService {
  generate(): PkcePair {
    const codeVerifier = randomBytes(32).toString('base64url');

    return { codeVerifier, codeChallenge: this.challenge(codeVerifier) };
  }

  challenge(codeVerifier: string): string {
    return createHash('sha256').update(codeVerifier).digest('base64url');
  }

  // Constant time: === would leak the verifier through timing (CWE-208).
  verify(storedChallenge: string, codeVerifier: string): boolean {
    const expected = Buffer.from(this.challenge(codeVerifier));
    const actual = Buffer.from(storedChallenge);

    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
