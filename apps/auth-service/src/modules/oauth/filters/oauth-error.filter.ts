import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

import { OAuthError } from '../oauth-error';

// @Catch(OAuthError) only: other errors of an OAuth route still reach the global ProblemDetailsFilter. no-store: error bodies can disclose token material.
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
