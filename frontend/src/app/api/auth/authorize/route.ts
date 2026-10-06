import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function base64url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return Buffer.from(s, 'binary').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const returnTo = request.nextUrl.searchParams.get('returnTo') ?? '/booking';
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64url(verifierBytes);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64url(new Uint8Array(digest));
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const backend = process.env.AUTH_BACKEND_URL ?? 'http://auth-service:3000';
  const clientId = process.env.OAUTH_CLIENT_ID ?? 'medcenter-web';
  const redirectUri = `${request.nextUrl.origin}/api/auth/callback`;
  const url = new URL(`${backend}/oauth/authorize`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', `${state}.${encodeURIComponent(returnTo)}`);
  url.searchParams.set('scope', 'launch patient/*.read patient/*.write user/*.read user/*.write offline_access');
  const response = NextResponse.redirect(url);
  response.cookies.set('mc_pkce', JSON.stringify({ verifier, state }), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 });
  return response;
}
