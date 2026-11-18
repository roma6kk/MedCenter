import { Inject, Injectable } from '@nestjs/common';
import { createPrivateKey, createSign, randomUUID } from 'node:crypto';

export const ACCESS_TOKEN_TTL_SECONDS = 900;

export const SIGNING_KEYS = 'SIGNING_KEYS';

export interface SigningKeys {
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
  readonly issuer: string;
  readonly kid: string;
}

interface AccessTokenClaims {
  readonly sub: string;
  readonly scope: string;
  readonly role: string;
  readonly patientRef?: string;
  readonly fhirUser?: string;
  readonly sid?: string;
}

interface AccessTokenPayload {
  readonly sub: string;
  readonly scope: string;
  readonly role: string;
  readonly jti: string;
  readonly iss: string;
  readonly iat: number;
  readonly exp: number;
  readonly patient?: string;
  readonly fhirUser?: string;
  readonly sid?: string;
}

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

// node:crypto rather than jose: jose is ESM-only and tests run through CJS ts-jest.
@Injectable()
export class JwtService {
  constructor(@Inject(SIGNING_KEYS) private readonly keys: SigningKeys) {}

  signAccessToken(claims: AccessTokenClaims): string {
    const iat = Math.floor(Date.now() / 1000);
    const payload: AccessTokenPayload = {
      sub: claims.sub,
      scope: claims.scope,
      role: claims.role,
      jti: randomUUID(),
      iss: this.keys.issuer,
      iat,
      exp: iat + ACCESS_TOKEN_TTL_SECONDS,
      ...(claims.patientRef !== undefined ? { patient: claims.patientRef } : {}),
      ...(claims.fhirUser !== undefined ? { fhirUser: claims.fhirUser } : {}),
      ...(claims.sid !== undefined ? { sid: claims.sid } : {}),
    };
    const signingInput = `${encodeSegment({
      alg: 'RS256',
      typ: 'JWT',
      kid: this.keys.kid,
    })}.${encodeSegment(payload)}`;
    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign(createPrivateKey(this.keys.privateKeyPem));

    return `${signingInput}.${signature.toString('base64url')}`;
  }
}
