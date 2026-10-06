import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decodeJwtPayload, type JwtClaims } from '@/lib/auth/jwt';

interface SessionPayload {
  readonly accessToken: string | null;
  readonly expiresAt: string | null;
  readonly role: string | null;
  readonly scope: string | null;
  readonly patientRef: string | null;
  readonly fhirUser: string | null;
}

const ANONYMOUS: SessionPayload = {
  accessToken: null,
  expiresAt: null,
  role: null,
  scope: null,
  patientRef: null,
  fhirUser: null,
};

interface TokenResponse {
  readonly access_token?: string;
  readonly expires_in?: number;
}

function isSecure(request: NextRequest): boolean {
  return process.env.NODE_ENV === 'production' || request.nextUrl.protocol === 'https:';
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const refreshToken: string | undefined = request.cookies.get('mc_rt')?.value;
  if (!refreshToken) return NextResponse.json(ANONYMOUS, { status: 200 });

  const backend: string = process.env.AUTH_BACKEND_URL ?? 'http://auth-service:3000';
  const tokenRes: Response = await fetch(`${backend}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.OAUTH_CLIENT_ID ?? 'medcenter-web',
    }),
  });
  if (!tokenRes.ok) {
    const cleared: NextResponse = NextResponse.json(ANONYMOUS, { status: 200 });
    cleared.cookies.delete('mc_rt');
    cleared.cookies.delete('mc_session');
    return cleared;
  }

  const tokens: TokenResponse = (await tokenRes.json()) as TokenResponse;
  const accessToken: string | undefined = tokens.access_token;
  if (accessToken === undefined) return NextResponse.json(ANONYMOUS, { status: 200 });

  const claims: JwtClaims = decodeJwtPayload(accessToken) ?? {};
  const expiresAt: string = new Date(Date.now() + (tokens.expires_in ?? 0) * 1000).toISOString();
  const payload: SessionPayload = {
    accessToken,
    expiresAt,
    role: claims.role ?? null,
    scope: claims.scope ?? null,
    patientRef: claims.patientRef ?? claims.patient ?? null,
    fhirUser: claims.fhirUser ?? null,
  };

  const response: NextResponse = NextResponse.json(payload);
  response.cookies.set('mc_session', '1', {
    httpOnly: true,
    secure: isSecure(request),
    sameSite: 'lax',
    path: '/',
    maxAge: 14 * 24 * 3600,
  });
  return response;
}
