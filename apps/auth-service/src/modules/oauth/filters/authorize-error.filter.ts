import { Catch, HttpException, HttpStatus, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ProblemDetailsFilter } from '@medcenter/common';
import type { Response } from 'express';

import { loginLocaleOf, sanitizeAuthorizeQuery } from '../login/authorize-query';
import type { CookieRequest } from '../login/login-cookies';
import { loginMessage } from '../login/login-messages';
import { LoginPageResponder, acceptsHtml } from '../login/login-page.responder';
import { OAuthError } from '../oauth-error';
import { OAuthErrorFilter } from './oauth-error.filter';

interface AuthorizeRequest extends CookieRequest {
  readonly query?: Readonly<Record<string, unknown>>;
  readonly requestId?: string;
}

@Catch()
export class AuthorizeErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(AuthorizeErrorFilter.name);
  private readonly oauthErrors = new OAuthErrorFilter();
  private readonly problems = new ProblemDetailsFilter();

  constructor(private readonly page: LoginPageResponder) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<AuthorizeRequest>();
    const response = host.switchToHttp().getResponse<Response>();
    const locale = loginLocaleOf(sanitizeAuthorizeQuery(request.query ?? {}));
    if (!acceptsHtml(request)) {
      this.delegate(exception, host);
      return;
    }
    if (exception instanceof OAuthError) {
      this.page.sendError(response, exception.getStatus(), loginMessage('brokenRequest', locale), locale);
      return;
    }
    if (exception instanceof HttpException) {
      this.problems.catch(exception, host);
      return;
    }
    this.logger.error({ err: exception, requestId: request.requestId }, 'Authorization request failed unexpectedly');
    this.page.sendError(response, HttpStatus.SERVICE_UNAVAILABLE, loginMessage('unavailable', locale), locale);
  }

  private delegate(exception: unknown, host: ArgumentsHost): void {
    if (exception instanceof OAuthError) {
      this.oauthErrors.catch(exception, host);
      return;
    }
    this.problems.catch(exception, host);
  }
}
