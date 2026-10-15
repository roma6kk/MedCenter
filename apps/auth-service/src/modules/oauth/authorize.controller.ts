import { Controller, Get, Logger, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '@medcenter/common';

import { OAuthErrorFilter } from './filters/oauth-error.filter';
import { AuthorizePageGuard } from './guards/authorize-page.guard';
import { ClientGuard, readQueryString, type RegisteredClient } from './guards/client.guard';
import { sanitizeAuthorizeQuery } from './login/authorize-query';
import { LOGIN_SESSION_COOKIE, expiredCookieOptions } from './login/login-cookies';
import { LoginPageResponder } from './login/login-page.responder';
import { LoginSessionGuard, type AuthorizePrincipal, type RequestWithLoginSession } from './login/login-session.guard';
import { LoginSessionService } from './login/login-session.service';
import { OAuthError } from './oauth-error';
import { OAuthService } from './oauth.service';

export interface AuthorizeRequest extends RequestWithLoginSession {
  readonly query: Record<string, unknown>;
  readonly client?: RegisteredClient;
}

/**
 * The `error` values RFC 6749 §4.1.2.1 allows on the authorize redirect.
 * `invalid_client`, `invalid_grant` and `unsupported_grant_type` belong to the
 * token endpoint (§5.2) and are reported as `access_denied` instead.
 */
type AuthorizeRedirectError = 'access_denied' | 'invalid_request' | 'invalid_scope';

/** M5: forwards the RFC code a SMART client branches on, e.g. `invalid_scope`. */
function toAuthorizeRedirectError(error: OAuthError): AuthorizeRedirectError {
  const body = error.getResponse();
  const code = typeof body === 'object' && body !== null && 'error' in body ? body.error : undefined;
  return code === 'invalid_request' || code === 'invalid_scope' ? code : 'access_denied';
}

function errorRedirect(redirectUri: string, state: string, error: AuthorizeRedirectError): string {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  if (state.length > 0) {
    url.searchParams.set('state', state);
  }
  return url.toString();
}

/**
 * `GET /oauth/authorize` (API 2.1.2) — Authorization Code + PKCE.
 *
 * - Without a login session the authorization server renders its own login
 *   form (assumption UI-1); `POST /oauth/login` comes back here afterwards.
 * - With one, the session is consumed (single use) and a code is issued for
 *   the account as it is now. A failure of this surface's domain bounces to
 *   the *registered* `redirect_uri` with its RFC 6749 §4.1.2.1 `error`; an
 *   infrastructure failure is not a consent decision and propagates to
 *   `ProblemDetailsFilter`.
 * - Errors raised before a redirect target is known leave as the RFC 6749
 *   §5.2 envelope via `OAuthErrorFilter`.
 */
@UseFilters(OAuthErrorFilter)
@Controller()
export class AuthorizeController {
  private readonly logger = new Logger(AuthorizeController.name);

  constructor(
    private readonly oauth: OAuthService,
    private readonly sessions: LoginSessionService,
    private readonly loginPage: LoginPageResponder,
  ) {}

  @Public()
  @UseGuards(ClientGuard, AuthorizePageGuard, LoginSessionGuard)
  @Get('oauth/authorize')
  async authorize(@Req() request: AuthorizeRequest, @Res() response: Response): Promise<void> {
    const client = request.client;
    const requestedRedirect = readQueryString(request.query, 'redirect_uri');
    const redirectUri = client === undefined ? requestedRedirect : requestedRedirect || client.redirectUris[0] || '';
    if (client === undefined || redirectUri.length === 0) {
      throw OAuthError.invalidRequest('client_id and a registered redirect_uri are required');
    }
    const principal = request.principal;
    if (principal === undefined) {
      this.loginPage.sendForm(request, response, { authorizeQuery: sanitizeAuthorizeQuery(request.query), redirectUri });
      return;
    }
    await this.sessions.end(principal.sessionId);
    response.clearCookie(LOGIN_SESSION_COOKIE, expiredCookieOptions(request));
    response.redirect(await this.issueCode(request, client, redirectUri, principal));
  }

  /** The redirect URL: `code` on success, the RFC error for a domain failure of this surface. */
  private async issueCode(
    request: AuthorizeRequest,
    client: RegisteredClient,
    redirectUri: string,
    principal: AuthorizePrincipal,
  ): Promise<string> {
    const state = readQueryString(request.query, 'state');
    const { claims } = principal;
    try {
      return await this.oauth.authorize({
        client,
        redirectUri,
        scope: readQueryString(request.query, 'scope'),
        state,
        codeChallenge: readQueryString(request.query, 'code_challenge'),
        principal: {
          userId: principal.userId,
          role: claims.role,
          ...(claims.patient !== undefined ? { patientRef: claims.patient } : {}),
          ...(claims.fhirUser !== undefined ? { fhirUser: claims.fhirUser } : {}),
        },
      });
    } catch (error: unknown) {
      if (!(error instanceof OAuthError)) {
        throw error;
      }
      this.logger.warn({ err: error, clientId: client.clientId }, 'Authorization request denied; bouncing to the registered redirect_uri');
      return errorRedirect(redirectUri, state, toAuthorizeRedirectError(error));
    }
  }
}
