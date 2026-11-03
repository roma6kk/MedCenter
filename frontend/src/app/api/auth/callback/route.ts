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

/** The OAuth error codes `/login` knows (login-error.ts): a refused sign-in, and a service that could not answer. */
const DENIED = 'access_denied';
const UNAVAILABLE = 'temporarily_unavailable';

/** `returnTo` is only passed for a callback that passed state verification, so the visitor's retry still lands where they were going. */
function failure(code: string = DENIED, returnTo: string | null = null): NextResponse {
  const suffix: string = returnTo === null ? '' : `&returnTo=${encodeURIComponent(returnTo)}`;
  const response: NextResponse = NextResponse.redirect(publicUrl(`/login?error=${code}${suffix}`));
  clearPkceCookie(response);
  return response;
}

function successTarget(tokens: TokenSet, input: CallbackInput): string {
  const { role } = buildSessionPayload(tokens);
  const requested: string = input.returnTo ?? (role === null ? FALLBACK_LANDING : ROLE_LANDING[role]);
  return resolvePostLoginPath(role, requested);
}

/**
 * PKCE callback: verifies state, exchanges the code, stores the refresh token and redirects (public origin only). A failure goes
 * back to `/login`: `access_denied` when the callback is not verifiable or the code was refused, `temporarily_unavailable` when
 * auth-service could not answer (unreachable, 429, 5xx).
 */
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
