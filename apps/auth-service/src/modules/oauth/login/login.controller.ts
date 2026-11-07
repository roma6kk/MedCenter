import { Body, Controller, HttpStatus, Inject, Logger, Post, Req, Res, UseFilters } from '@nestjs/common';
import type { Response } from 'express';
import { ApiProblems, Public, RateLimit } from '@medcenter/common';
import { ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CredentialsService } from '../../users/credentials.service';
import { CLIENT_REGISTRY, type ClientRegistry } from '../guards/client.guard';
import { authorizeLocation, loginLocaleOf, sanitizeAuthorizeQuery } from './authorize-query';
import {
  LOGIN_CSRF_COOKIE,
  LOGIN_SESSION_COOKIE,
  expiredCookieOptions,
  readCookie,
  sessionCookieOptions,
  type CookieRequest,
} from './login-cookies';
import { LoginFormDto } from './login-form.dto';
import { loginMessage, type LoginLocale } from './login-messages';
import type { LoginFormView } from './login-page.responder';
import { LoginPageResponder } from './login-page.responder';
import { LoginRateLimitFilter } from './login-rate-limit.filter';
import { resolveRedirectUri } from './login-redirect';
import { LoginSessionService } from './login-session.service';
import { ACCOUNT_ATTEMPT_WINDOW_SECONDS, LoginThrottle } from './login-throttle.service';

const LOGIN_RATE_LIMIT = 10;

interface LoginRequest extends CookieRequest {
  readonly ip?: string;
}

type Refusal = Pick<LoginFormView, 'status' | 'error' | 'email' | 'retryAfterSeconds'>;

@ApiTags('auth')
@Controller('oauth')
export class LoginController {
  private readonly logger = new Logger(LoginController.name);

  constructor(
    private readonly credentials: CredentialsService,
    private readonly throttle: LoginThrottle,
    private readonly sessions: LoginSessionService,
    private readonly page: LoginPageResponder,
    @Inject(CLIENT_REGISTRY) private readonly clients: ClientRegistry,
  ) {}

  @Public()
  @ApiOperation({ summary: '2.1.2 Submit the login form of the authorization flow' })
  @ApiConsumes('application/x-www-form-urlencoded')
  @ApiBody({ type: LoginFormDto })
  @ApiResponse({
    status: 200,
    description: 'Wrong credentials: the login form again with a message (HTML)',
    content: { 'text/html': { schema: { type: 'string' } } },
  })
  @ApiResponse({
    status: 302,
    description: 'Credentials accepted: sets the login session cookie and redirects to GET /oauth/authorize with the original query',
    headers: { Location: { description: '/oauth/authorize?...', schema: { type: 'string' } } },
  })
  @ApiResponse({
    status: 400,
    description: 'Unusable authorization request (HTML page), or input rejected by validation (problem+json)',
    content: {
      'text/html': { schema: { type: 'string' } },
      'application/problem+json': { schema: { $ref: '#/components/schemas/problemDetails' } },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Stale form: the CSRF token does not match (HTML)',
    content: { 'text/html': { schema: { type: 'string' } } },
  })
  @ApiResponse({
    status: 429,
    description: 'Per-IP or per-account attempt limit reached (HTML login page with Retry-After)',
    content: { 'text/html': { schema: { type: 'string' } } },
  })
  @ApiResponse({
    status: 503,
    description: 'The attempt counter is unavailable; login fails closed (HTML)',
    content: { 'text/html': { schema: { type: 'string' } } },
  })
  @ApiProblems([500])
  @RateLimit(LOGIN_RATE_LIMIT)
  @UseFilters(LoginRateLimitFilter)
  @Post('login')
  async login(@Body() form: LoginFormDto, @Req() request: LoginRequest, @Res() response: Response): Promise<void> {
    const authorizeQuery = sanitizeAuthorizeQuery(form.authorize_query ?? '');
    const locale = loginLocaleOf(authorizeQuery);
    const redirectUri = await resolveRedirectUri(this.clients, authorizeQuery);
    if (redirectUri === null) {
      this.page.sendError(response, HttpStatus.BAD_REQUEST, loginMessage('brokenRequest', locale), locale);
      return;
    }
    const email = form.email ?? '';
    const refusal = await this.refusalOf(form, request, locale);
    if (refusal !== null) {
      this.page.sendForm(request, response, { authorizeQuery, redirectUri, email, ...refusal });
      return;
    }
    const userId = await this.credentials.verify(email, form.password ?? '');
    if (userId === null) {
      this.logger.warn({ ip: request.ip }, 'Login rejected: invalid credentials or inactive account');
      this.page.sendForm(request, response, {
        authorizeQuery,
        redirectUri,
        email,
        error: loginMessage('invalidCredentials', locale),
        fieldError: true,
      });
      return;
    }
    await this.throttle.forgive(email);
    this.resumeAuthorization(request, response, userId, authorizeQuery);
  }

  // A stale form is refused first (not an attempt); the rest is counted against the account.
  private async refusalOf(form: LoginFormDto, request: LoginRequest, locale: LoginLocale): Promise<Refusal | null> {
    if (!this.sessions.verifyCsrf(readCookie(request, LOGIN_CSRF_COOKIE), form.csrf)) {
      return { status: HttpStatus.FORBIDDEN, error: loginMessage('staleForm', locale), email: '' };
    }
    const admission = await this.throttle.admit(form.email ?? '');
    if (admission === 'throttled') {
      this.logger.warn({ ip: request.ip }, 'Login refused: the account reached its attempt limit');
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        error: loginMessage('throttled', locale),
        retryAfterSeconds: ACCOUNT_ATTEMPT_WINDOW_SECONDS,
      };
    }
    return admission === 'unavailable' ? { status: HttpStatus.SERVICE_UNAVAILABLE, error: loginMessage('unavailable', locale) } : null;
  }

  private resumeAuthorization(request: LoginRequest, response: Response, userId: string, authorizeQuery: string): void {
    this.logger.log({ userId }, 'Login accepted; resuming the authorization request');
    response.clearCookie(LOGIN_CSRF_COOKIE, expiredCookieOptions(request));
    response.cookie(LOGIN_SESSION_COOKIE, this.sessions.issue(userId), sessionCookieOptions(request));
    response.redirect(HttpStatus.FOUND, authorizeLocation(authorizeQuery));
  }
}
