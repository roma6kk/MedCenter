import { SetMetadata } from '@nestjs/common';

export const REQUIRES_SCOPES_KEY = 'requiresScopes';

/** Declares the SMART scopes a route demands; checked by `ScopeGuard`. */
export const RequiresScopes = (...scopes: string[]): MethodDecorator =>
  SetMetadata(REQUIRES_SCOPES_KEY, scopes);
