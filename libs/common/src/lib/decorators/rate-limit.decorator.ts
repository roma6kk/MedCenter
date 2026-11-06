import { applyDecorators, SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimitPerMinute';
export const RATE_LIMIT_CREDENTIAL_KEY = 'rateLimitCredentialCeiling';

export interface RateLimitOptions {
  readonly perAddressCeiling?: number;
}

export const RateLimit = (perMinute: number, options: RateLimitOptions = {}): MethodDecorator =>
  applyDecorators(
    SetMetadata(RATE_LIMIT_KEY, perMinute),
    ...(options.perAddressCeiling === undefined
      ? []
      : [SetMetadata(RATE_LIMIT_CREDENTIAL_KEY, options.perAddressCeiling)]),
  );
