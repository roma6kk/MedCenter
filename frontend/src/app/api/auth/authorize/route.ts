import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isSecureOrigin, resolveAuthBackendUrl, resolveOauthClientId, resolvePublicOrigin, resolveRedirectUri } from '@/lib/auth/auth-config';
import { buildState } from '@/lib/auth/callback-flow';
import { createPkcePair, createState } from '@/lib/auth/pkce';
import { sanitizeReturnTo } from '@/lib/auth/return-to';
import { setPkceCookie } from '@/lib/auth/session-cookies';

export const dynamic = 'force-dynamic';

const SCOPE = 'launch patient/*.read patient/*.write user/*.read user/*.write';

/** Starts the SMART authorization-code + PKCE flow: 302 to auth-service, verifier kept in an httpOnly cookie. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requested: string | null = request.nextUrl.searchParams.get('returnTo');
  const sanitized: string = requested === null ? '' : sanitizeReturnTo(requested, '');
  const { verifier, challenge } = await createPkcePair();
  const state: string = createState();

  const url = new URL(`${resolveAuthBackendUrl()}/oauth/authorize`);
  url.searchParams.set('client_id', resolveOauthClientId());
  url.searchParams.set('redirect_uri', resolveRedirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', buildState(state, sanitized === '' ? null : sanitized));
  url.searchParams.set('scope', SCOPE);

  const response: NextResponse = NextResponse.redirect(url);
  setPkceCookie(response, JSON.stringify({ verifier, state }), isSecureOrigin(resolvePublicOrigin()));
  return response;
}
