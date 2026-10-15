import type { CookieOptions } from 'express';

import { isCookieSecureForced } from '../../../config/auth-env';
import { LOGIN_CSRF_TTL_SECONDS, LOGIN_SESSION_TTL_SECONDS } from './login-session.service';

/** Both cookies are scoped to the authorization server's own paths, never to the API or the client. */
export const LOGIN_COOKIE_PATH = '/oauth';
export const LOGIN_SESSION_COOKIE = 'mc_as_session';
export const LOGIN_CSRF_COOKIE = 'mc_as_csrf';

export interface CookieRequest {
  readonly headers: { readonly cookie?: string };
  /** Express `req.secure`: honours `X-Forwarded-Proto` once `trust proxy` is set (`main.ts`). */
  readonly secure?: boolean;
}

/** Reads one cookie from the raw `Cookie` header (`cookie-parser` is not a dependency). */
export function readCookie(request: CookieRequest, name: string): string | undefined {
  const header = request.headers.cookie;
  if (header === undefined) {
    return undefined;
  }
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator > 0 && pair.slice(0, separator).trim() === name) {
      return safeDecode(pair.slice(separator + 1).trim());
    }
  }
  return undefined;
}

function safeDecode(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    // A malformed escape cannot be one of our (base64url) values: treat it as absent.
    return undefined;
  }
}

/**
 * `Secure` whenever the browser reached us over TLS — directly or through
 * Traefik (`X-Forwarded-Proto`, honoured via `TRUST_PROXY`) — or when forced by
 * `AUTH_COOKIE_SECURE`. Not tied to `NODE_ENV`: the compose dev edge serves
 * plain HTTP with `NODE_ENV=production`, where a `Secure` cookie is dropped.
 */
function isSecure(request: CookieRequest): boolean {
  return request.secure === true || isCookieSecureForced(process.env);
}

/**
 * `SameSite=Lax`: the cookie is set by the `POST /oauth/login` response and
 * must ride along on the same-site 302 back to `GET /oauth/authorize`.
 */
export function sessionCookieOptions(request: CookieRequest): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure(request),
    path: LOGIN_COOKIE_PATH,
    maxAge: LOGIN_SESSION_TTL_SECONDS * 1000,
  };
}

/** `SameSite=Strict`: the form is only ever submitted from this server's own page. */
export function csrfCookieOptions(request: CookieRequest): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: isSecure(request),
    path: LOGIN_COOKIE_PATH,
    maxAge: LOGIN_CSRF_TTL_SECONDS * 1000,
  };
}

/** Options for `clearCookie`: must repeat the attributes the cookie was set with. */
export function expiredCookieOptions(request: CookieRequest): CookieOptions {
  return { httpOnly: true, secure: isSecure(request), path: LOGIN_COOKIE_PATH };
}
