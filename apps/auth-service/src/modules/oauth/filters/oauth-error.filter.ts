import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

import { OAuthError } from '../oauth-error';

/**
 * Renders `OAuthError` as the RFC 6749 §5.2 envelope:
 * `{ error, error_description, errorCode }`.
 *
 * Scoping is the whole point: `@Catch(OAuthError)` matches *only* this surface's
 * errors, so anything else thrown by an OAuth route still falls through to the
 * global `ProblemDetailsFilter` (OWASP A05/A09). The global filter is left
 * untouched, so every other BFF service keeps RFC 7807.
 *
 * `Cache-Control: no-store` is required by RFC 6749 §5.1 for token-endpoint
 * responses; error bodies can equally disclose token material.
 */
@Catch(OAuthError)
export class OAuthErrorFilter implements ExceptionFilter {
  catch(exception: OAuthError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    response
      .status(exception.getStatus())
      .setHeader('Cache-Control', 'no-store')
      .setHeader('Pragma', 'no-cache')
      .type('application/json')
      .send(exception.getResponse());
  }
}
