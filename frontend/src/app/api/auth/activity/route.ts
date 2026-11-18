import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { recordSessionActivity } from '@/lib/auth/session-broker';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

// The tab's in-memory Bearer is forwarded as is: an expired one answers 401 and the client refreshes through the usual path and retries.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (bearer === undefined) return NextResponse.json({ error: 'unauthenticated' }, { status: 401, headers: NO_STORE });
  const result = await recordSessionActivity(bearer);
  if (result === 'unauthorized') return NextResponse.json({ error: 'unauthenticated' }, { status: 401, headers: NO_STORE });
  if (result === 'unavailable') return NextResponse.json({ error: 'auth_unavailable' }, { status: 503, headers: NO_STORE });
  return NextResponse.json({ recorded: result === 'recorded' }, { headers: NO_STORE });
}
