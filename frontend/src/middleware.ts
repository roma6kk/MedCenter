import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { publicUrl } from '@/lib/auth/auth-config';
import { shouldRedirectToLogin } from '@/lib/auth/route-guard';
import { SESSION_MARKER_COOKIE } from '@/lib/auth/session-cookies';

// Redirects to the configured PUBLIC origin: behind a container request.nextUrl carries 0.0.0.0. Role gating is client-side, BFF guards are the authority.
export function middleware(request: NextRequest): NextResponse {
  const hasSession: boolean = request.cookies.has(SESSION_MARKER_COOKIE);
  const { pathname, search } = request.nextUrl;
  if (!shouldRedirectToLogin(pathname, hasSession)) return NextResponse.next();

  const login: URL = publicUrl('/login');
  login.searchParams.set('returnTo', `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'] };
