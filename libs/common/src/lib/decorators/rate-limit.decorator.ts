import { applyDecorators, SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimitPerMinute';
export const RATE_LIMIT_CREDENTIAL_KEY = 'rateLimitCredentialCeiling';

export interface RateLimitOptions {
  /**
   * Token-endpoint mode: the per-minute budget is kept per credential
   * (`client_id|grant_type|sha256(code or refresh_token)`), so clients behind one NAT
   * do not share a bucket, and this generous per-address ceiling stops a flood of
   * ever-new credentials. A request without a credential falls back to `client_id|ip`.
   */
  readonly perAddressCeiling?: number;
}

/** Overrides the per-minute request budget for a single route (e.g. 20 for `POST /oauth/token`). */
export const RateLimit = (perMinute: number, options: RateLimitOptions = {}): MethodDecorator =>
  applyDecorators(
    SetMetadata(RATE_LIMIT_KEY, perMinute),
    ...(options.perAddressCeiling === undefined
      ? []
      : [SetMetadata(RATE_LIMIT_CREDENTIAL_KEY, options.perAddressCeiling)]),
  );
