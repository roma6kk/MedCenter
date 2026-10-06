import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { shouldRedirectToLogin } from '@/lib/auth/route-guard';

export function middleware(request: NextRequest): NextResponse {
  const hasSession = request.cookies.has('mc_session');
  const path = request.nextUrl.pathname;
  if (shouldRedirectToLogin(path, hasSession)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('returnTo', path);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'] };
