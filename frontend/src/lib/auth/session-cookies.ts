import type { NextResponse } from 'next/server';
import type { TokenSet } from './token-response';

export const PKCE_COOKIE = 'mc_pkce';
export const REFRESH_COOKIE = 'mc_rt';
export const ACCESS_COOKIE = 'mc_at';
export const SESSION_MARKER_COOKIE = 'mc_session';

const BROKER_PATH = '/api/auth';

const REFRESH_MAX_AGE_SECONDS = 14 * 24 * 3600;
const PKCE_MAX_AGE_SECONDS = 600;
const LEGACY_PATH = '/';

interface CookieAttributes {
  readonly httpOnly: true;
  readonly secure: boolean;
  readonly sameSite: 'lax';
  readonly path: string;
  readonly maxAge: number;
}

function attributes(secure: boolean, path: string, maxAge: number): CookieAttributes {
  return { httpOnly: true, secure, sameSite: 'lax', path, maxAge };
}

export function setPkceCookie(response: NextResponse, value: string, secure: boolean): void {
  response.cookies.set(PKCE_COOKIE, value, attributes(secure, '/', PKCE_MAX_AGE_SECONDS));
}

export function clearPkceCookie(response: NextResponse): void {
  response.cookies.delete(PKCE_COOKIE);
}

// NextResponse.cookies keeps one entry per cookie name, so the legacy `mc_rt` on `/` is a raw header, appended after the last cookies.set/delete.
function appendExpiredCookie(response: NextResponse, name: string, path: string): void {
  response.headers.append('Set-Cookie', `${name}=; Path=${path}; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax`);
}

export function setSessionCookies(response: NextResponse, tokens: TokenSet, secure: boolean): void {
  response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, attributes(secure, BROKER_PATH, REFRESH_MAX_AGE_SECONDS));
  response.cookies.set(ACCESS_COOKIE, tokens.accessToken, attributes(secure, BROKER_PATH, tokens.expiresIn));
  response.cookies.set(SESSION_MARKER_COOKIE, '1', attributes(secure, '/', REFRESH_MAX_AGE_SECONDS));
  // A leftover `mc_rt` on `/` would be sent next to the new one and could shadow it.
  appendExpiredCookie(response, REFRESH_COOKIE, LEGACY_PATH);
}

export function clearSessionCookies(response: NextResponse): void {
  response.cookies.delete({ name: REFRESH_COOKIE, path: BROKER_PATH });
  response.cookies.delete({ name: ACCESS_COOKIE, path: BROKER_PATH });
  response.cookies.delete(SESSION_MARKER_COOKIE);
  appendExpiredCookie(response, REFRESH_COOKIE, LEGACY_PATH);
  appendExpiredCookie(response, ACCESS_COOKIE, LEGACY_PATH);
}
