import { HttpStatus, Injectable } from '@nestjs/common';
import type { Response } from 'express';

import { LOGIN_CSRF_COOKIE, csrfCookieOptions, type CookieRequest } from './login-cookies';
import { loginLocaleOf } from './authorize-query';
import type { LoginLocale } from './login-messages';
import { LOGIN_PAGE_CSP, renderLoginErrorPage, renderLoginPage } from './login-page';
import { LoginSessionService } from './login-session.service';

export interface LoginFormView {
  readonly authorizeQuery: string;
  readonly redirectUri: string;
  readonly status?: HttpStatus;
  readonly error?: string;
  readonly fieldError?: boolean;
  readonly email?: string;
  readonly retryAfterSeconds?: number;
}

export function acceptsHtml(request: { readonly headers?: { readonly accept?: string } }): boolean {
  return (request.headers?.accept ?? '').toLowerCase().includes('text/html');
}

function urlOn(path: string, redirectUri: string): string | undefined {
  try {
    return new URL(path, redirectUri).toString();
  } catch {
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
      // The page URL carries the authorization request; it must not leak through the register or site link.
      'Referrer-Policy': 'no-referrer',
    })
    .send(html);
}

@Injectable()
export class LoginPageResponder {
  constructor(private readonly sessions: LoginSessionService) {}

  sendForm(request: CookieRequest, response: Response, view: LoginFormView): void {
    const csrf = this.sessions.issueCsrf();
    const registerUrl = urlOn('/register', view.redirectUri);
    const siteUrl = urlOn('/', view.redirectUri);
    response.cookie(LOGIN_CSRF_COOKIE, csrf.cookie, csrfCookieOptions(request));
    const html = renderLoginPage({
      authorizeQuery: view.authorizeQuery,
      csrfField: csrf.field,
      locale: loginLocaleOf(view.authorizeQuery),
      ...(view.fieldError === true ? { fieldError: true } : {}),
      ...(view.error !== undefined ? { error: view.error } : {}),
      ...(view.email !== undefined ? { email: view.email } : {}),
      ...(registerUrl !== undefined ? { registerUrl } : {}),
      ...(siteUrl !== undefined ? { siteUrl } : {}),
    });
    sendHtml(response, view.status ?? HttpStatus.OK, html, view.retryAfterSeconds);
  }

  sendError(response: Response, status: HttpStatus, message: string, locale?: LoginLocale): void {
    sendHtml(response, status, renderLoginErrorPage(message, locale));
  }
}
