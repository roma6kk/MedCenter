/**
 * token-response — runtime validation of the `POST /oauth/token` body (API 2.1.3).
 *
 * The broker trusts nothing it did not validate: a body without both tokens must
 * never end up in a cookie as the literal string "undefined".
 */

export interface TokenSet {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function parseTokenSet(body: unknown): TokenSet | null {
  if (typeof body !== 'object' || body === null) return null;
  const record = body as Readonly<Record<string, unknown>>;
  const accessToken: string | null = nonEmptyString(record['access_token']);
  const refreshToken: string | null = nonEmptyString(record['refresh_token']);
  const expiresIn: unknown = record['expires_in'];
  if (accessToken === null || refreshToken === null) return null;
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) return null;
  return { accessToken, refreshToken, expiresIn };
}
