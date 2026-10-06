import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sanitizeReturnTo, parsePkceCookie } from '@/lib/auth/return-to';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get('code');
  const stateParam = request.nextUrl.searchParams.get('state') ?? '';
  const raw = request.cookies.get('mc_pkce')?.value;
  const home = new URL('/login?error=access_denied', request.url);
  if (!code || !raw) return NextResponse.redirect(home);
  const parsed = parsePkceCookie(raw);
  if (parsed === null) return NextResponse.redirect(home);
  const { verifier, state } = parsed;
  const dotIndex = stateParam.indexOf('.');
  const returnedState = dotIndex === -1 ? stateParam : stateParam.slice(0, dotIndex);
  const encodedReturnTo = dotIndex === -1 ? '' : stateParam.slice(dotIndex + 1);
  if (returnedState !== state || returnedState.length === 0) return NextResponse.redirect(home);
  const backend = process.env.AUTH_BACKEND_URL ?? 'http://auth-service:3000';
  const tokenRes = await fetch(`${backend}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code,
      redirect_uri: `${request.nextUrl.origin}/api/auth/callback`,
      code_verifier: verifier,
      client_id: process.env.OAUTH_CLIENT_ID ?? 'medcenter-web',
    }),
  });
  if (!tokenRes.ok) return NextResponse.redirect(home);
  const tokens = (await tokenRes.json()) as { access_token: string; refresh_token: string; expires_in: number };
  let returnTo = '/booking';
  if (encodedReturnTo) {
    try {
      returnTo = sanitizeReturnTo(decodeURIComponent(encodedReturnTo), '/booking');
    } catch {
      returnTo = '/booking';
    }
  }
  const isSecure: boolean = process.env.NODE_ENV === 'production' || request.nextUrl.protocol === 'https:';
  const response = NextResponse.redirect(new URL(returnTo, request.url));
  response.cookies.set('mc_rt', tokens.refresh_token, { httpOnly: true, secure: isSecure, sameSite: 'lax', path: '/', maxAge: 14 * 24 * 3600 });
  response.cookies.set('mc_session', '1', { httpOnly: false, secure: isSecure, sameSite: 'lax', path: '/', maxAge: tokens.expires_in });
  response.cookies.delete('mc_pkce');
  return response;
}
