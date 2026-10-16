import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { revokeRefreshToken, rotateRefreshToken } from '@/lib/auth/session-broker';
import { ACCESS_COOKIE, REFRESH_COOKIE, clearSessionCookies } from '@/lib/auth/session-cookies';

export const dynamic = 'force-dynamic';

function bearerOf(request: NextRequest): string | null {
  const header: string | null = request.headers.get('authorization');
  const match: RegExpExecArray | null = header === null ? null : /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
}

/** API 2.1.4 needs the owner's Bearer: the client's own, else the one the broker cached, else one minted from the refresh cookie. */
async function revokeSession(refreshToken: string, bearer: string | null): Promise<void> {
  if (bearer !== null) {
    await revokeRefreshToken(refreshToken, bearer);
    return;
  }
  const rotated = await rotateRefreshToken(refreshToken);
  if (rotated.ok) await revokeRefreshToken(rotated.tokens.refreshToken, rotated.tokens.accessToken);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const refreshToken: string | undefined = request.cookies.get(REFRESH_COOKIE)?.value;
  if (refreshToken !== undefined && refreshToken.length > 0) {
    await revokeSession(refreshToken, bearerOf(request) ?? request.cookies.get(ACCESS_COOKIE)?.value ?? null);
  }
  const response: NextResponse = NextResponse.json({ loggedOut: true }, { headers: { 'Cache-Control': 'no-store' } });
  clearSessionCookies(response);
  return response;
}
