import { SetMetadata } from '@nestjs/common';

export const REQUIRES_SCOPES_KEY = 'requiresScopes';

export const RequiresScopes = (...scopes: string[]): MethodDecorator =>
  SetMetadata(REQUIRES_SCOPES_KEY, scopes);
