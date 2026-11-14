'use client';

import { useEffect } from 'react';
import { apiFetch } from '@/lib/api/api-fetch';
import { resolveIdleTimeoutMs, startIdleWatch } from '@/lib/auth/idle-watch';
import { endIdleSession } from '@/lib/auth/session-client';
import { useSessionStore } from '@/store/use-session-store';

const IDLE_TIMEOUT_MS = resolveIdleTimeoutMs(process.env.NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MINUTES);

async function pingServer(): Promise<boolean> {
  const result = await apiFetch<{ readonly recorded?: boolean }>('/api/auth/activity', { method: 'POST' });
  return result.recorded !== false;
}

export function IdleSessionWatcher(): null {
  const signedIn = useSessionStore((state) => state.role !== null);

  useEffect(() => {
    if (!signedIn) return undefined;
    return startIdleWatch({ timeoutMs: IDLE_TIMEOUT_MS, onIdle: () => void endIdleSession(), sendPing: pingServer });
  }, [signedIn]);

  return null;
}
