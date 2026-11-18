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
import { loginLocaleOf, sanitizeAuthorizeQuery } from './authorize-query';
import type { CookieRequest } from './login-cookies';
import { loginMessage, type LoginMessageKey } from './login-messages';
import { LoginPageResponder, acceptsHtml } from './login-page.responder';
import { resolveRedirectUri } from './login-redirect';

interface LoginFormRequest extends CookieRequest {
  readonly body?: Readonly<Record<string, unknown>>;
}

function textOf(body: LoginFormRequest['body'], field: string, maxLength: number): string {
  const value = body?.[field];
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

// A browser form post must end in the login page (429 throttle / 503 unavailable); other errors go to the shared problem filter.
@Catch()
export class LoginRateLimitFilter implements ExceptionFilter {
  private readonly logger = new Logger(LoginRateLimitFilter.name);
  private readonly problems = new ProblemDetailsFilter();

  constructor(
    private readonly page: LoginPageResponder,
    @Inject(CLIENT_REGISTRY) private readonly clients: ClientRegistry,
  ) {}

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const refusal = this.refusalOf(exception, host);
    if (refusal === null) {
      this.problems.catch(exception, host);
      return;
    }
    if (!(exception instanceof HttpException)) {
      const request = host.switchToHttp().getRequest<LoginFormRequest & { readonly requestId?: string }>();
      this.logger.error({ err: exception, requestId: request.requestId }, 'Login request failed unexpectedly');
    }
    try {
      await this.sendLoginPage(host, refusal.status, refusal.message);
    } catch (error: unknown) {
      this.logger.error({ err: error }, 'Could not render the login page for a refused request');
      this.problems.catch(exception, host);
    }
  }

  private refusalOf(exception: unknown, host: ArgumentsHost): { status: HttpStatus; message: LoginMessageKey } | null {
    if (exception instanceof HttpException) {
      return exception.getStatus() === HttpStatus.TOO_MANY_REQUESTS
        ? { status: HttpStatus.TOO_MANY_REQUESTS, message: 'throttled' }
        : null;
    }
    const request = host.switchToHttp().getRequest<LoginFormRequest>();
    return acceptsHtml(request) ? { status: HttpStatus.SERVICE_UNAVAILABLE, message: 'unavailable' } : null;
  }

  private async sendLoginPage(host: ArgumentsHost, status: HttpStatus, key: LoginMessageKey): Promise<void> {
    const http = host.switchToHttp();
    const request = http.getRequest<LoginFormRequest>();
    const response = http.getResponse<Response>();
    const authorizeQuery = sanitizeAuthorizeQuery(textOf(request.body, 'authorize_query', 8192));
    const locale = loginLocaleOf(authorizeQuery);
    const message = loginMessage(key, locale);
    const redirectUri = await resolveRedirectUri(this.clients, authorizeQuery);
    if (redirectUri === null) {
      this.page.sendError(response, status, message, locale);
      return;
    }
    this.page.sendForm(request, response, {
      authorizeQuery,
      redirectUri,
      status,
      error: message,
      email: textOf(request.body, 'email', EMAIL_MAX_LENGTH),
    });
  }
}
