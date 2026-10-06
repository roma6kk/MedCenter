import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const refreshToken = request.cookies.get('mc_rt')?.value;
  if (!refreshToken) return NextResponse.json({ error: 'no_refresh' }, { status: 401 });
  const backend = process.env.AUTH_BACKEND_URL ?? 'http://auth-service:3000';
  const tokenRes = await fetch(`${backend}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: process.env.OAUTH_CLIENT_ID ?? 'medcenter-web' }),
  });
  if (!tokenRes.ok) return NextResponse.json({ error: 'refresh_failed' }, { status: 401 });
  const tokens = (await tokenRes.json()) as { access_token: string; refresh_token: string; expires_in: number };
  const isSecure: boolean = process.env.NODE_ENV === 'production' || request.nextUrl.protocol === 'https:';
  const response = NextResponse.json({ accessToken: tokens.access_token, expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString() });
  response.cookies.set('mc_rt', tokens.refresh_token, { httpOnly: true, secure: isSecure, sameSite: 'lax', path: '/', maxAge: 14 * 24 * 3600 });
  response.cookies.set('mc_session', '1', { httpOnly: false, secure: isSecure, sameSite: 'lax', path: '/', maxAge: tokens.expires_in });
  return response;
}
