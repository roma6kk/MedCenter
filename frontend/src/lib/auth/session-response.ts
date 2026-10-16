/**
 * session-response — shared body of `GET /api/auth/session` and `POST /api/auth/refresh`.
 *
 * Both answer with the access token plus the claims the UI needs. `/session` serves a still-valid `mc_at` cookie as it is
 * (a page load must not cost a call to the token endpoint: it allows 20/min for the whole web server); otherwise, and always
 * for `/refresh`, the refresh token is rotated. The rotated pair MUST be stored back into the cookies: refresh tokens are
 * single-use, so a response that drops the new one would log the user out on the next page load.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isSecureOrigin, resolvePublicOrigin } from './auth-config';
import { ANONYMOUS_SESSION, buildSessionPayload, readCachedSession, rotateRefreshToken, type RotationResult, type SessionPayload } from './session-broker';
import { ACCESS_COOKIE, REFRESH_COOKIE, clearSessionCookies, setSessionCookies } from './session-cookies';

export interface RotationPolicy {
  /** `/session` answers an anonymous visitor with 200 (it doubles as the container health probe); `/refresh` with 401. */
  readonly anonymousStatus: 200 | 401;
  /**
   * `/session` may answer from the still-valid `mc_at` cookie. `/refresh` never does: it is called because the access token
   * was rejected, so handing the same token back would not help.
   */
  readonly allowCachedAccessToken: boolean;
}

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function anonymous(status: 200 | 401): NextResponse {
  return NextResponse.json(ANONYMOUS_SESSION, { status, headers: NO_STORE });
}

function failureResponse(result: Extract<RotationResult, { ok: false }>, policy: RotationPolicy): NextResponse {
  if (result.reason === 'unavailable') {
    return NextResponse.json({ error: 'auth_unavailable' }, { status: 503, headers: NO_STORE });
  }
  const response: NextResponse = anonymous(policy.anonymousStatus);
  clearSessionCookies(response);
  return response;
}

function cachedSession(request: NextRequest, policy: RotationPolicy): SessionPayload | null {
  return policy.allowCachedAccessToken ? readCachedSession(request.cookies.get(ACCESS_COOKIE)?.value) : null;
}

export async function rotateSessionResponse(request: NextRequest, policy: RotationPolicy): Promise<NextResponse> {
  const refreshToken: string | undefined = request.cookies.get(REFRESH_COOKIE)?.value;
  if (refreshToken === undefined || refreshToken.length === 0) return anonymous(policy.anonymousStatus);

  const cached: SessionPayload | null = cachedSession(request, policy);
  if (cached !== null) return NextResponse.json(cached, { headers: NO_STORE });

  const result: RotationResult = await rotateRefreshToken(refreshToken);
  if (!result.ok) return failureResponse(result, policy);

  const response: NextResponse = NextResponse.json(buildSessionPayload(result.tokens), { headers: NO_STORE });
  setSessionCookies(response, result.tokens, isSecureOrigin(resolvePublicOrigin()));
  return response;
}
