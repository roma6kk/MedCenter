// Order OAC No. 66, annex 3, item 3.7: a session that sees no user activity is ended. The last-activity time lives in localStorage so every tab of the browser shares one clock.

export const DEFAULT_IDLE_TIMEOUT_MINUTES = 15;

const ACTIVITY_KEY = 'mc-last-activity';
const WRITE_THROTTLE_MS = 5_000;
const PING_INTERVAL_MS = 60_000;
const CHECK_INTERVAL_MS = 15_000;
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

export function resolveIdleTimeoutMs(raw: string | undefined): number {
  const minutes = Number(raw);
  return (Number.isInteger(minutes) && minutes >= 1 ? minutes : DEFAULT_IDLE_TIMEOUT_MINUTES) * 60_000;
}

export interface IdleWatchOptions {
  readonly timeoutMs: number;
  readonly onIdle: () => void;
  // The server keeps its own idle clock; false means it already ended the session.
  readonly sendPing: () => Promise<boolean>;
}

function readShared(): number | null {
  try {
    const value = Number(window.localStorage.getItem(ACTIVITY_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeShared(at: number): void {
  try {
    window.localStorage.setItem(ACTIVITY_KEY, String(at));
  } catch {
    // storage blocked: this tab keeps its own clock
  }
}

export function startIdleWatch({ timeoutMs, onIdle, sendPing }: IdleWatchOptions): () => void {
  let lastActivity = Date.now();
  let lastWrite = 0;
  let lastPing = 0;
  let ended = false;
  writeShared(lastActivity);

  const latest = (): number => Math.max(lastActivity, readShared() ?? 0);

  const end = (): void => {
    if (ended) return;
    ended = true;
    onIdle();
  };

  const check = (): boolean => {
    if (Date.now() - latest() < timeoutMs) return false;
    end();
    return true;
  };

  const ping = (now: number): void => {
    if (now - lastPing < PING_INTERVAL_MS) return;
    lastPing = now;
    void sendPing().then((recorded) => {
      if (!recorded) end();
    }, () => undefined);
  };

  const onActivity = (): void => {
    if (ended || check()) return;
    const now = Date.now();
    lastActivity = now;
    if (now - lastWrite >= WRITE_THROTTLE_MS) {
      lastWrite = now;
      writeShared(now);
    }
    ping(now);
  };

  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') onActivity();
  };

  ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, onActivity, { passive: true, capture: true }));
  document.addEventListener('visibilitychange', onVisibility);
  const timer = window.setInterval(check, CHECK_INTERVAL_MS);

  return () => {
    ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, onActivity, { capture: true }));
    document.removeEventListener('visibilitychange', onVisibility);
    window.clearInterval(timer);
  };
}
