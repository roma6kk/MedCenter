import type { NextRequest, NextResponse } from 'next/server';
import { rotateSessionResponse } from '@/lib/auth/session-response';

export const dynamic = 'force-dynamic';

/** Session probe: 200 with `accessToken: null` for an anonymous visitor, else the cached or rotated session. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return rotateSessionResponse(request, { anonymousStatus: 200, allowCachedAccessToken: true });
}
