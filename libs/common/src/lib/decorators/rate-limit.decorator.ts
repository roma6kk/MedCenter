import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimitPerMinute';

/** Overrides the per-minute request budget for a single route (e.g. 20 for `POST /oauth/token`). */
export const RateLimit = (perMinute: number): MethodDecorator =>
  SetMetadata(RATE_LIMIT_KEY, perMinute);
