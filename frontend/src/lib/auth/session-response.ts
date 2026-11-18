import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isSecureOrigin, resolvePublicOrigin } from './auth-config';
import { ANONYMOUS_SESSION, buildSessionPayload, readCachedSession, rotateRefreshToken, type RotationResult, type SessionPayload } from './session-broker';
import { ACCESS_COOKIE, REFRESH_COOKIE, clearSessionCookies, setSessionCookies } from './session-cookies';

export interface RotationPolicy {
  readonly anonymousStatus: 200 | 401;
  // /refresh never answers from the mc_at cookie: it is called because that access token was rejected.
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
