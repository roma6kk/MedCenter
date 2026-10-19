/**
 * login-error — the `?error=` of `/login`. The OAuth callback (`/api/auth/callback`) sends the visitor back with an
 * OAuth error code when the sign-in did not complete; the page shows a readable message for it, never the raw code.
 */
export type LoginErrorKind = 'denied' | 'unavailable';

/** Codes that say "the sign-in service had a problem, try again later" rather than "the sign-in was refused". */
const UNAVAILABLE_CODES: ReadonlyArray<string> = ['server_error', 'temporarily_unavailable'];

/** `null` for a plain visit; otherwise the kind of message to show. Unknown codes read as a refused sign-in. */
export function parseLoginError(raw: string | ReadonlyArray<string> | undefined): LoginErrorKind | null {
  const code: string = (typeof raw === 'string' ? raw : (raw?.[0] ?? '')).trim().toLowerCase();
  if (code === '') return null;
  return UNAVAILABLE_CODES.includes(code) ? 'unavailable' : 'denied';
}
