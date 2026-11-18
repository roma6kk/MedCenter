// Fail closed: the verifier is never sent to auth-service unless code, PKCE cookie and state all match.
import { resolveAuthBackendUrl, resolveOauthClientId, resolveRedirectUri, type EnvSource } from './auth-config';
import { parsePkceCookie, sanitizeReturnTo } from './return-to';
import { parseTokenSet, type TokenSet } from './token-response';

export interface CallbackInput {
  readonly code: string;
  readonly verifier: string;
  readonly returnTo: string | null;
}

const STATE_SEPARATOR = '.';
const TOKEN_TIMEOUT_MS = 8_000;

export function buildState(state: string, returnTo: string | null): string {
  return returnTo === null ? state : `${state}${STATE_SEPARATOR}${encodeURIComponent(returnTo)}`;
}

function splitState(stateParam: string): { readonly state: string; readonly encodedReturnTo: string } {
  const index = stateParam.indexOf(STATE_SEPARATOR);
  if (index === -1) return { state: stateParam, encodedReturnTo: '' };
  return { state: stateParam.slice(0, index), encodedReturnTo: stateParam.slice(index + 1) };
}

function returnToFrom(encodedReturnTo: string): string | null {
  const sanitized = sanitizeReturnTo(encodedReturnTo, '');
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
    // 400/401 mean the code was refused; 429, 5xx or a non-token body mean the service could not decide.
    if (response.status === 400 || response.status === 401) return { ok: false, reason: 'invalid' };
    if (!response.ok) return { ok: false, reason: 'unavailable' };
    const tokens: TokenSet | null = parseTokenSet(await response.json());
    return tokens === null ? { ok: false, reason: 'unavailable' } : { ok: true, tokens };
  } catch (error: unknown) {
    console.error('[auth-broker] authorization-code exchange failed: auth-service unreachable', error);
    return { ok: false, reason: 'unavailable' };
  }
}
