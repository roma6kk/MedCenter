import { HttpStatus, Injectable } from '@nestjs/common';
import type { Response } from 'express';

import { LOGIN_CSRF_COOKIE, csrfCookieOptions, type CookieRequest } from './login-cookies';
import { LOGIN_PAGE_CSP, renderLoginErrorPage, renderLoginPage } from './login-page';
import { LoginSessionService } from './login-session.service';

export interface LoginFormView {
  readonly authorizeQuery: string;
  /** The validated `redirect_uri` of the client; its origin hosts the registration page. */
  readonly redirectUri: string;
  readonly status?: HttpStatus;
  readonly error?: string;
  readonly email?: string;
  /** Sent as `Retry-After` with a refusal that tells the browser when to come back. */
  readonly retryAfterSeconds?: number;
}

/** The client's own registration page (`frontend/src/app/(auth)/register`), on the `redirect_uri` origin. */
export function registerUrlFor(redirectUri: string): string | undefined {
  try {
    return new URL('/register', redirectUri).toString();
  } catch {
    // An unparsable redirect_uri never passed client validation; render without the link.
    return undefined;
  }
}

function sendHtml(response: Response, status: HttpStatus, html: string, retryAfterSeconds?: number): void {
  response
    .status(status)
    .set({
      ...(retryAfterSeconds !== undefined ? { 'Retry-After': String(retryAfterSeconds) } : {}),
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
      'Content-Security-Policy': LOGIN_PAGE_CSP,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      // The page URL carries the authorization request; it must not leak through the register link.
      'Referrer-Policy': 'no-referrer',
    })
    .send(html);
}

/**
 * Sends the authorization server's login page (assumption UI-1). Every render
 * mints a fresh CSRF pair: the nonce goes into an httpOnly cookie, its MAC
 * into the form.
 */
@Injectable()
export class LoginPageResponder {
  constructor(private readonly sessions: LoginSessionService) {}

  sendForm(request: CookieRequest, response: Response, view: LoginFormView): void {
    const csrf = this.sessions.issueCsrf();
    const registerUrl = registerUrlFor(view.redirectUri);
    response.cookie(LOGIN_CSRF_COOKIE, csrf.cookie, csrfCookieOptions(request));
    const html = renderLoginPage({
      authorizeQuery: view.authorizeQuery,
      csrfField: csrf.field,
      ...(view.error !== undefined ? { error: view.error } : {}),
      ...(view.email !== undefined ? { email: view.email } : {}),
      ...(registerUrl !== undefined ? { registerUrl } : {}),
    });
    sendHtml(response, view.status ?? HttpStatus.OK, html, view.retryAfterSeconds);
  }

  sendError(response: Response, status: HttpStatus, message: string): void {
    sendHtml(response, status, renderLoginErrorPage(message));
  }
}
