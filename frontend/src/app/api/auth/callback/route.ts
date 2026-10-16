import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isSecureOrigin, publicUrl, resolvePublicOrigin } from '@/lib/auth/auth-config';
import { exchangeAuthorizationCode, parseCallback, type CallbackInput } from '@/lib/auth/callback-flow';
import { buildSessionPayload } from '@/lib/auth/session-broker';
import { PKCE_COOKIE, clearPkceCookie, setSessionCookies } from '@/lib/auth/session-cookies';
import type { TokenSet } from '@/lib/auth/token-response';
import { ROLE_LANDING, resolvePostLoginPath } from '@/lib/auth/user-role';

export const dynamic = 'force-dynamic';

const FALLBACK_LANDING = ROLE_LANDING.PATIENT;

function failure(): NextResponse {
  const response: NextResponse = NextResponse.redirect(publicUrl('/login?error=access_denied'));
  clearPkceCookie(response);
  return response;
}

function successTarget(tokens: TokenSet, input: CallbackInput): string {
  const { role } = buildSessionPayload(tokens);
  const requested: string = input.returnTo ?? (role === null ? FALLBACK_LANDING : ROLE_LANDING[role]);
  return resolvePostLoginPath(role, requested);
}

/** PKCE callback: verifies state, exchanges the code, stores the refresh token and redirects (public origin only). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const input: CallbackInput | null = parseCallback(request.nextUrl.searchParams, request.cookies.get(PKCE_COOKIE)?.value);
  if (input === null) return failure();

  const tokens: TokenSet | null = await exchangeAuthorizationCode(input);
  if (tokens === null) return failure();

  const response: NextResponse = NextResponse.redirect(publicUrl(successTarget(tokens, input)));
  setSessionCookies(response, tokens, isSecureOrigin(resolvePublicOrigin()));
  clearPkceCookie(response);
  return response;
}
