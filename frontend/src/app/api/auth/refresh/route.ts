import type { NextRequest, NextResponse } from 'next/server';
import { rotateSessionResponse } from '@/lib/auth/session-response';

export const dynamic = 'force-dynamic';

/** Silent refresh: rotates the httpOnly refresh cookie and returns the new access token and claims. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return rotateSessionResponse(request, { anonymousStatus: 401, allowCachedAccessToken: false });
}
