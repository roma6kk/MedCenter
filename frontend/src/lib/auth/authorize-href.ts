export const AUTHORIZE_PATH = '/api/auth/authorize';

export function authorizeHref(returnTo: string): string {
  return returnTo === '' ? AUTHORIZE_PATH : `${AUTHORIZE_PATH}?returnTo=${encodeURIComponent(returnTo)}`;
}

export const SESSION_ENDED_REASON = 'session-ended';

export function isSessionEnded(raw: string | ReadonlyArray<string> | undefined): boolean {
  return (typeof raw === 'string' ? raw : (raw?.[0] ?? '')).trim().toLowerCase() === SESSION_ENDED_REASON;
}
