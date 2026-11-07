import type { CookieOptions } from 'express';

import { isCookieSecureForced } from '../../../config/auth-env';
import { LOGIN_CSRF_TTL_SECONDS, LOGIN_SESSION_TTL_SECONDS } from './login-session.service';

const LOGIN_COOKIE_PATH = '/oauth';
export const LOGIN_SESSION_COOKIE = 'mc_as_session';
export const LOGIN_CSRF_COOKIE = 'mc_as_csrf';

export interface CookieRequest {
  readonly headers: { readonly cookie?: string; readonly accept?: string };
  readonly secure?: boolean;
}

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

// Not tied to NODE_ENV: the compose dev edge serves plain HTTP with NODE_ENV=production, where a Secure cookie is dropped.
function isSecure(request: CookieRequest): boolean {
  return request.secure === true || isCookieSecureForced(process.env);
}

// Lax: must ride along on the same-site 302 back to GET /oauth/authorize.
export function sessionCookieOptions(request: CookieRequest): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure(request),
    path: LOGIN_COOKIE_PATH,
    maxAge: LOGIN_SESSION_TTL_SECONDS * 1000,
  };
}

export function csrfCookieOptions(request: CookieRequest): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: isSecure(request),
    path: LOGIN_COOKIE_PATH,
    maxAge: LOGIN_CSRF_TTL_SECONDS * 1000,
  };
}

export function expiredCookieOptions(request: CookieRequest): CookieOptions {
  return { httpOnly: true, secure: isSecure(request), path: LOGIN_COOKIE_PATH };
}
