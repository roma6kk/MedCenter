/**
 * access-token — in-memory holder for the SMART access token.
 *
 * The refresh token never leaves the browser's httpOnly `mc_rt` cookie
 * (frontend-design-spec §4). The short-lived access token is kept in JS
 * memory only — never in localStorage/sessionStorage — and is attached as
 * `Authorization: Bearer` by `apiFetch`. Keeping it in a dedicated module
 * avoids a circular import between `api-fetch` and the session store.
 */

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function clearAccessToken(): void {
  accessToken = null;
}
