/** The route handler that starts the SMART authorization-code + PKCE flow and answers a redirect to auth-service. */
export const AUTHORIZE_PATH = '/api/auth/authorize';

/** Link that signs a visitor in; `returnTo` (already sanitised, same-origin path) brings them back to the page they wanted. Empty: the role's home page. */
export function authorizeHref(returnTo: string): string {
  return returnTo === '' ? AUTHORIZE_PATH : `${AUTHORIZE_PATH}?returnTo=${encodeURIComponent(returnTo)}`;
}

/** `?reason=` of `/login` when a revoked session sent the visitor here: the page stays (the toast says why) instead of redirecting at once. */
export const SESSION_ENDED_REASON = 'session-ended';

export function isSessionEnded(raw: string | ReadonlyArray<string> | undefined): boolean {
  return (typeof raw === 'string' ? raw : (raw?.[0] ?? '')).trim().toLowerCase() === SESSION_ENDED_REASON;
}
