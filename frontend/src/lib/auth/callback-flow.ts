/**
 * callback-flow — the verification half of `GET /api/auth/callback` (fail-closed PKCE).
 *
 * Every missing or mismatching piece (code, PKCE cookie, state) rejects the callback:
 * the verifier is never sent to auth-service unless the browser proves it started this flow.
 */
import { resolveAuthBackendUrl, resolveOauthClientId, resolveRedirectUri, type EnvSource } from './auth-config';
import { parsePkceCookie, sanitizeReturnTo } from './return-to';
import { parseTokenSet, type TokenSet } from './token-response';

export interface CallbackInput {
  readonly code: string;
  readonly verifier: string;
  /** Sanitized same-origin path the user asked for, or `null` (then the role landing page is used). */
  readonly returnTo: string | null;
}

const STATE_SEPARATOR = '.';
const TOKEN_TIMEOUT_MS = 8_000;

export function buildState(state: string, returnTo: string | null): string {
  return returnTo === null ? state : `${state}${STATE_SEPARATOR}${encodeURIComponent(returnTo)}`;
}

function splitState(stateParam: string): { readonly state: string; readonly encodedReturnTo: string } {
  const index: number = stateParam.indexOf(STATE_SEPARATOR);
  if (index === -1) return { state: stateParam, encodedReturnTo: '' };
  return { state: stateParam.slice(0, index), encodedReturnTo: stateParam.slice(index + 1) };
}

function returnToFrom(encodedReturnTo: string): string | null {
  const sanitized: string = sanitizeReturnTo(encodedReturnTo, '');
  return sanitized === '' ? null : sanitized;
}

export function parseCallback(params: URLSearchParams, pkceCookie: string | undefined): CallbackInput | null {
  if (params.has('error')) return null;
  const code: string | null = params.get('code');
  if (code === null || code.length === 0) return null;
  const pkce = parsePkceCookie(pkceCookie);
  if (pkce === null) return null;
  const { state, encodedReturnTo } = splitState(params.get('state') ?? '');
  if (state.length === 0 || state !== pkce.state) return null;
  return { code, verifier: pkce.verifier, returnTo: returnToFrom(encodedReturnTo) };
}

/** `invalid`: auth-service refused the code (the visitor signs in again). `unavailable`: it could not answer (try again in a minute). */
export type CodeExchangeResult =
  | { readonly ok: true; readonly tokens: TokenSet }
  | { readonly ok: false; readonly reason: 'invalid' | 'unavailable' };

export async function exchangeAuthorizationCode(input: CallbackInput, env: EnvSource = process.env): Promise<CodeExchangeResult> {
  try {
    const response: Response = await fetch(`${resolveAuthBackendUrl(env)}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: input.code,
        redirect_uri: resolveRedirectUri(env),
        code_verifier: input.verifier,
        client_id: resolveOauthClientId(env),
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
    // The endpoint refuses a code with 400 (invalid_grant, invalid_request) or 401 (invalid_client); a rate limit (429), 5xx or a body
    // that is not a token pair says the service could not decide, as in the refresh rotation.
    if (response.status === 400 || response.status === 401) return { ok: false, reason: 'invalid' };
    if (!response.ok) return { ok: false, reason: 'unavailable' };
    const tokens: TokenSet | null = parseTokenSet(await response.json());
    return tokens === null ? { ok: false, reason: 'unavailable' } : { ok: true, tokens };
  } catch (error: unknown) {
    console.error('[auth-broker] authorization-code exchange failed: auth-service unreachable', error);
    return { ok: false, reason: 'unavailable' };
  }
}
