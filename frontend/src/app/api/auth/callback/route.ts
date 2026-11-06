import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isSecureOrigin, publicUrl, resolvePublicOrigin } from '@/lib/auth/auth-config';
import { exchangeAuthorizationCode, parseCallback, type CallbackInput, type CodeExchangeResult } from '@/lib/auth/callback-flow';
import { buildSessionPayload } from '@/lib/auth/session-broker';
import { PKCE_COOKIE, clearPkceCookie, setSessionCookies } from '@/lib/auth/session-cookies';
import type { TokenSet } from '@/lib/auth/token-response';
import { ROLE_LANDING, resolvePostLoginPath } from '@/lib/auth/user-role';

export const dynamic = 'force-dynamic';

const FALLBACK_LANDING = ROLE_LANDING.PATIENT;

const DENIED = 'access_denied';
const UNAVAILABLE = 'temporarily_unavailable';

function failure(code: string = DENIED, returnTo: string | null = null): NextResponse {
  const suffix = returnTo === null ? '' : `&returnTo=${encodeURIComponent(returnTo)}`;
  const response: NextResponse = NextResponse.redirect(publicUrl(`/login?error=${code}${suffix}`));
  clearPkceCookie(response);
  return response;
}

function successTarget(tokens: TokenSet, input: CallbackInput): string {
  const { role } = buildSessionPayload(tokens);
  const requested = input.returnTo ?? (role === null ? FALLBACK_LANDING : ROLE_LANDING[role]);
  return resolvePostLoginPath(role, requested);
}

// A failure goes back to /login: access_denied when unverifiable or refused, temporarily_unavailable when auth-service could not answer.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const input: CallbackInput | null = parseCallback(request.nextUrl.searchParams, request.cookies.get(PKCE_COOKIE)?.value);
  if (input === null) return failure();

  const exchange: CodeExchangeResult = await exchangeAuthorizationCode(input);
  if (!exchange.ok) return failure(exchange.reason === 'unavailable' ? UNAVAILABLE : DENIED, input.returnTo);

  const response: NextResponse = NextResponse.redirect(publicUrl(successTarget(exchange.tokens, input)));
  setSessionCookies(response, exchange.tokens, isSecureOrigin(resolvePublicOrigin()));
  clearPkceCookie(response);
  return response;
}
