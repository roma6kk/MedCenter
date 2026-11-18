export const AUTHORIZE_PATH = '/api/auth/authorize';

export function authorizeHref(returnTo: string): string {
  return returnTo === '' ? AUTHORIZE_PATH : `${AUTHORIZE_PATH}?returnTo=${encodeURIComponent(returnTo)}`;
}

export const SESSION_ENDED_REASON = 'session-ended';

export const SESSION_IDLE_REASON = 'session-idle';

export function isSessionEnded(raw: string | ReadonlyArray<string> | undefined): boolean {
  const reason = (typeof raw === 'string' ? raw : (raw?.[0] ?? '')).trim().toLowerCase();
  return reason === SESSION_ENDED_REASON || reason === SESSION_IDLE_REASON;
}
