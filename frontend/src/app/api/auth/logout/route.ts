import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { revokeRefreshToken, rotateRefreshToken } from '@/lib/auth/session-broker';
import { ACCESS_COOKIE, REFRESH_COOKIE, clearSessionCookies } from '@/lib/auth/session-cookies';

export const dynamic = 'force-dynamic';

function bearerOf(request: NextRequest): string | null {
  return /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1] ?? null;
}

// An idle tab's Bearer is long expired (401), so a refused revoke falls back to a minted pair: otherwise the refresh token would stay valid 14 days after logout.
async function revokeSession(refreshToken: string, bearer: string | null, reason: 'idle' | undefined): Promise<void> {
  if (bearer !== null && (await revokeRefreshToken(refreshToken, bearer, undefined, reason))) return;
  const rotated = await rotateRefreshToken(refreshToken);
  if (rotated.ok) await revokeRefreshToken(rotated.tokens.refreshToken, rotated.tokens.accessToken, undefined, reason);
}

// Only the client's own idle sign-out sends a body; auth-service still checks the session really was quiet before it journals the reason.
async function readReason(request: NextRequest): Promise<'idle' | undefined> {
  const body = (await request.json().catch(() => null)) as { readonly reason?: unknown } | null;
  return body?.reason === 'idle' ? 'idle' : undefined;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (refreshToken !== undefined && refreshToken.length > 0) {
    await revokeSession(refreshToken, bearerOf(request) ?? request.cookies.get(ACCESS_COOKIE)?.value ?? null, await readReason(request));
  }
  const response = NextResponse.json({ loggedOut: true }, { headers: { 'Cache-Control': 'no-store' } });
  clearSessionCookies(response);
  return response;
}
