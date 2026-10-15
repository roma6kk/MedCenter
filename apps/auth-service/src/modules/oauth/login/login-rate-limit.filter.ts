import {
  Catch,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { ProblemDetailsFilter } from '@medcenter/common';
import type { Response } from 'express';

import { EMAIL_MAX_LENGTH } from '../../users/dto/validation-patterns';
import { CLIENT_REGISTRY, type ClientRegistry } from '../guards/client.guard';
import { sanitizeAuthorizeQuery } from './authorize-query';
import type { CookieRequest } from './login-cookies';
import { THROTTLED_MESSAGE } from './login-messages';
import { LoginPageResponder } from './login-page.responder';
import { resolveRedirectUri } from './login-redirect';

interface LoginFormRequest extends CookieRequest {
  readonly body?: Readonly<Record<string, unknown>>;
}

function textOf(body: LoginFormRequest['body'], field: string, maxLength: number): string {
  const value = body?.[field];
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

/**
 * The per-IP `@RateLimit` of `POST /oauth/login` throws from a guard, before
 * the handler can draw anything, and the global filter would answer a browser
 * form post with a JSON problem document. This filter turns exactly that `429`
 * into the login page with a message; every other `HttpException` of the route
 * (e.g. a validation error) still leaves through the shared problem filter.
 */
@Catch(HttpException)
export class LoginRateLimitFilter implements ExceptionFilter<HttpException> {
  private readonly logger = new Logger(LoginRateLimitFilter.name);
  private readonly problems = new ProblemDetailsFilter();

  constructor(
    private readonly page: LoginPageResponder,
    @Inject(CLIENT_REGISTRY) private readonly clients: ClientRegistry,
  ) {}

  async catch(exception: HttpException, host: ArgumentsHost): Promise<void> {
    if (exception.getStatus() !== HttpStatus.TOO_MANY_REQUESTS) {
      this.problems.catch(exception, host);
      return;
    }
    try {
      await this.sendLoginPage(host);
    } catch (error: unknown) {
      this.logger.error({ err: error }, 'Could not render the login page for a rate-limited request');
      this.problems.catch(exception, host);
    }
  }

  private async sendLoginPage(host: ArgumentsHost): Promise<void> {
    const http = host.switchToHttp();
    const request = http.getRequest<LoginFormRequest>();
    const response = http.getResponse<Response>();
    const authorizeQuery = sanitizeAuthorizeQuery(textOf(request.body, 'authorize_query', 8192));
    const redirectUri = await resolveRedirectUri(this.clients, authorizeQuery);
    if (redirectUri === null) {
      this.page.sendError(response, HttpStatus.TOO_MANY_REQUESTS, THROTTLED_MESSAGE);
      return;
    }
    this.page.sendForm(request, response, {
      authorizeQuery,
      redirectUri,
      status: HttpStatus.TOO_MANY_REQUESTS,
      error: THROTTLED_MESSAGE,
      email: textOf(request.body, 'email', EMAIL_MAX_LENGTH),
    });
  }
}
