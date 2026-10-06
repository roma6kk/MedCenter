import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const refreshToken = request.cookies.get('mc_rt')?.value;
  const backend = process.env.AUTH_BACKEND_URL ?? 'http://auth-service:3000';
  if (refreshToken) {
    await fetch(`${backend}/oauth/token/revoke`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) }).catch(() => undefined);
  }
  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.delete('mc_rt');
  response.cookies.delete('mc_session');
  return response;
}
