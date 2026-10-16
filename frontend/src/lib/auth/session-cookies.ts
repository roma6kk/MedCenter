/**
 * session-cookies — the httpOnly cookies of the token broker (frontend-design-spec §2).
 *
 * - `mc_pkce`    — PKCE verifier + state between /authorize and /callback (10 min)
 * - `mc_rt`      — refresh token, never readable by page JavaScript (14 days)
 * - `mc_at`      — the access token the broker last minted, for as long as it is valid (15 min); lets `/api/auth/session`
 *                  answer without a token-endpoint call, which is rate-limited to 20/min for the whole web server
 * - `mc_session` — non-secret marker the edge middleware checks for a signed-in browser
 *
 * `mc_rt` and `mc_at` are scoped to `/api/auth`: no page request and no proxied `/api/v1` call needs to carry them.
 * Releases before this scoping set `mc_rt` on `/`; clearing removes both paths so a stale copy cannot shadow the new one.
 */
import type { NextResponse } from 'next/server';
import type { TokenSet } from './token-response';

export const PKCE_COOKIE = 'mc_pkce';
export const REFRESH_COOKIE = 'mc_rt';
export const ACCESS_COOKIE = 'mc_at';
export const SESSION_MARKER_COOKIE = 'mc_session';

export const BROKER_PATH = '/api/auth';

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

/**
 * `NextResponse.cookies` keeps one entry per cookie NAME, so the same name on a second path (the legacy `mc_rt` on `/`)
 * has to be a raw header. Raw headers must be appended after the last `cookies.set/delete`, which rebuilds the header list.
 */
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
