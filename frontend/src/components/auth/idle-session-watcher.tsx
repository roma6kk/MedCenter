'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { apiFetch } from '@/lib/api/api-fetch';
import { resolveIdleTimeoutMs, startIdleWatch } from '@/lib/auth/idle-watch';
import { endIdleSession, refreshSession } from '@/lib/auth/session-client';
import { useT } from '@/lib/i18n/use-t';
import { useSessionStore } from '@/store/use-session-store';

const IDLE_TIMEOUT_MS = resolveIdleTimeoutMs(process.env.NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MINUTES);
const WARN_BEFORE_MS = Math.min(60_000, IDLE_TIMEOUT_MS / 2);

async function pingServer(): Promise<boolean> {
  const result = await apiFetch<{ readonly recorded?: boolean }>('/api/auth/activity', { method: 'POST' });
  return result.recorded !== false;
}

async function renewSession(): Promise<boolean> {
  const outcome = await refreshSession();
  if (outcome === 'unavailable') throw new Error('token service unavailable');
  return outcome === 'ok';
}

function secondsLeft(endsAt: number): number {
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}

function IdleWarning({ endsAt }: { readonly endsAt: number }): ReactNode {
  const t = useT('session');
  const [seconds, setSeconds] = useState(() => secondsLeft(endsAt));

  useEffect(() => {
    const timer = window.setInterval(() => setSeconds(secondsLeft(endsAt)), 1000);
    return () => window.clearInterval(timer);
  }, [endsAt]);

  // Any click or key press, including this button and closing the dialog, is activity that cancels the warning.
  const stay = (): void => undefined;
  return (
    <Dialog
      title={t('idleWarningTitle')}
      description={<span aria-live="polite">{t('idleWarningText', { seconds })}</span>}
      onClose={stay}
      size="sm"
      footer={
        <Button variant="primary" onClick={stay}>
          {t('idleWarningStay')}
        </Button>
      }
    />
  );
}

export function IdleSessionWatcher(): ReactNode {
  const signedIn = useSessionStore((state) => state.role !== null);
  const [endsAt, setEndsAt] = useState<number | null>(null);

  useEffect(() => {
    if (!signedIn) return undefined;
    const stop = startIdleWatch({
      timeoutMs: IDLE_TIMEOUT_MS,
      onIdle: () => {
        setEndsAt(null);
        void endIdleSession();
      },
      sendPing: pingServer,
      renewSession,
      warnBeforeMs: WARN_BEFORE_MS,
      onWarn: setEndsAt,
      onResume: () => setEndsAt(null),
    });
    return () => {
      stop();
      setEndsAt(null);
    };
  }, [signedIn]);

  return endsAt === null ? null : <IdleWarning endsAt={endsAt} />;
}
