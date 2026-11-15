'use client';

import { useEffect } from 'react';
import { apiFetch } from '@/lib/api/api-fetch';
import { resolveIdleTimeoutMs, startIdleWatch } from '@/lib/auth/idle-watch';
import { endIdleSession, refreshSession } from '@/lib/auth/session-client';
import { useSessionStore } from '@/store/use-session-store';

const IDLE_TIMEOUT_MS = resolveIdleTimeoutMs(process.env.NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MINUTES);

async function pingServer(): Promise<boolean> {
  const result = await apiFetch<{ readonly recorded?: boolean }>('/api/auth/activity', { method: 'POST' });
  return result.recorded !== false;
}

async function renewSession(): Promise<boolean> {
  const outcome = await refreshSession();
  if (outcome === 'unavailable') throw new Error('token service unavailable');
  return outcome === 'ok';
}

export function IdleSessionWatcher(): null {
  const signedIn = useSessionStore((state) => state.role !== null);

  useEffect(() => {
    if (!signedIn) return undefined;
    return startIdleWatch({ timeoutMs: IDLE_TIMEOUT_MS, onIdle: () => void endIdleSession(), sendPing: pingServer, renewSession });
  }, [signedIn]);

  return null;
}
