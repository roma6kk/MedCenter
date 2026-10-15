/**
 * Parameters of an authorization request (RFC 6749 §4.1.1, RFC 7636, SMART
 * App Launch) that the login form carries back to `GET /oauth/authorize`.
 * Nothing else survives the round trip.
 */
const AUTHORIZE_PARAMS = [
  'response_type',
  'client_id',
  'redirect_uri',
  'scope',
  'state',
  'code_challenge',
  'code_challenge_method',
  'launch',
  'aud',
] as const;

/** A single parameter longer than this is not a legitimate authorization request. */
const MAX_PARAM_LENGTH = 2048;

export const AUTHORIZE_PATH = '/oauth/authorize';

function firstValue(source: URLSearchParams | Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = source instanceof URLSearchParams ? source.get(key) : source[key];
  return typeof value === 'string' && value.length <= MAX_PARAM_LENGTH ? value : undefined;
}

/**
 * Re-serialises the authorization request from either the parsed query of
 * `GET /oauth/authorize` or the raw hidden field of the login form, keeping
 * only the known parameters (first value, bounded length).
 */
export function sanitizeAuthorizeQuery(source: string | Readonly<Record<string, unknown>>): string {
  const input = typeof source === 'string' ? new URLSearchParams(source) : source;
  const output = new URLSearchParams();
  for (const key of AUTHORIZE_PARAMS) {
    const value = firstValue(input, key);
    if (value !== undefined) {
      output.set(key, value);
    }
  }
  return output.toString();
}

/**
 * The post-login redirect target. The path is fixed — the form can only send
 * the browser back to this server's authorize endpoint, which re-validates the
 * client and its registered `redirect_uri` (no open redirect).
 */
export function authorizeLocation(sanitizedQuery: string): string {
  return `${AUTHORIZE_PATH}?${sanitizedQuery}`;
}
