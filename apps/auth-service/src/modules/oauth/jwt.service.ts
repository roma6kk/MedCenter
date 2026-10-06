import { Inject, Injectable } from '@nestjs/common';
import { createPrivateKey, createSign, randomUUID } from 'node:crypto';

/** Access-token lifetime mandated by API 2.1.3 (15 minutes). */
export const ACCESS_TOKEN_TTL_SECONDS = 900;

/** DI token for the RS256 key material (see `oauth.module.ts`). */
export const SIGNING_KEYS = 'SIGNING_KEYS';

export interface SigningKeys {
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
  readonly issuer: string;
  readonly kid: string;
}

export interface AccessTokenClaims {
  readonly sub: string;
  readonly scope: string;
  readonly role: string;
  readonly patientRef?: string;
  readonly fhirUser?: string;
  /**
   * Session id of the token pair (`oauth.service.ts` passes the paired refresh
   * token's `jti`) so revoking that refresh token also denies this access token
   * at the guard layer.
   */
  readonly sid?: string;
}

/** JWT payload — the exact claim set the guard stack reads (`libs/common`). */
export interface AccessTokenPayload {
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

/**
 * Signs the access token as a compact JWS with `RS256`, matching the JWKS the
 * guard layer fetches independently in every BFF service (ADR-009). Signing
 * uses `node:crypto` rather than `jose` because `jose` is ESM-only and this
 * runs through the CJS Jest/ts-jest pipeline.
 */
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
