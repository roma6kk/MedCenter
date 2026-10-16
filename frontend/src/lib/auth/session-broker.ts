/**
 * session-broker — server-side calls of the Next.js token broker to auth-service.
 *
 * Refresh tokens are single-use (API 2.1.3 rotation): a second exchange of the same token
 * is `invalid_grant`. Several requests can legitimately present the same cookie at once —
 * React StrictMode double effects, a doctor opening three appointments in three tabs — so a
 * rotation result is shared for a short grace window instead of logging the loser out.
 */
import { createHash } from 'node:crypto';
import { resolveAuthBackendUrl, resolveOauthClientId, type EnvSource } from './auth-config';
import { decodeJwtPayload, type JwtClaims } from './jwt';
import { parseTokenSet, type TokenSet } from './token-response';
import { parseUserRole, type UserRole } from './user-role';

export interface SessionPayload {
  readonly accessToken: string | null;
  readonly expiresAt: string | null;
  readonly role: UserRole | null;
  readonly scope: string | null;
  readonly patientRef: string | null;
  readonly fhirUser: string | null;
}

export const ANONYMOUS_SESSION: SessionPayload = {
  accessToken: null,
  expiresAt: null,
  role: null,
  scope: null,
  patientRef: null,
  fhirUser: null,
};

/** `invalid`: the refresh token is unusable (clear the cookies). `unavailable`: try again later (keep them). */
export type RotationResult =
  | { readonly ok: true; readonly tokens: TokenSet }
  | { readonly ok: false; readonly reason: 'invalid' | 'unavailable' };

const ROTATION_GRACE_MS = 10_000;
const REQUEST_TIMEOUT_MS = 8_000;

interface GraceEntry {
  readonly startedAt: number;
  readonly result: Promise<RotationResult>;
}

const recentRotations = new Map<string, GraceEntry>();

export function payloadFromAccessToken(accessToken: string, expiresAt: string): SessionPayload {
  const claims: JwtClaims = decodeJwtPayload(accessToken) ?? {};
  return {
    accessToken,
    expiresAt,
    role: parseUserRole(claims.role),
    scope: claims.scope ?? null,
    patientRef: claims.patientRef ?? claims.patient ?? null,
    fhirUser: claims.fhirUser ?? null,
  };
}

export function buildSessionPayload(tokens: TokenSet, now: number = Date.now()): SessionPayload {
  return payloadFromAccessToken(tokens.accessToken, new Date(now + tokens.expiresIn * 1000).toISOString());
}

/** An access token younger than this is served from its cookie; older ones are exchanged for a fresh pair. */
export const CACHED_TOKEN_MARGIN_MS = 60_000;

/**
 * The session described by a still-valid `mc_at` cookie, or `null` when it is missing, malformed, about to expire or
 * carries no known role. Reads claims only — the BFFs verify the signature on every call (ADR-009).
 */
export function readCachedSession(accessToken: string | undefined, now: number = Date.now()): SessionPayload | null {
  if (accessToken === undefined || accessToken.length === 0) return null;
  const claims: JwtClaims | null = decodeJwtPayload(accessToken);
  if (claims === null || typeof claims.exp !== 'number') return null;
  const expiresAtMs: number = claims.exp * 1000;
  if (expiresAtMs - now <= CACHED_TOKEN_MARGIN_MS) return null;
  const payload: SessionPayload = payloadFromAccessToken(accessToken, new Date(expiresAtMs).toISOString());
  return payload.role === null ? null : payload;
}

function formBody(refreshToken: string, env: EnvSource): URLSearchParams {
  return new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: resolveOauthClientId(env),
  });
}

async function requestRotation(refreshToken: string, env: EnvSource): Promise<RotationResult> {
  try {
    const response: Response = await fetch(`${resolveAuthBackendUrl(env)}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody(refreshToken, env),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 400 || response.status === 401) return { ok: false, reason: 'invalid' };
    if (!response.ok) return { ok: false, reason: 'unavailable' };
    const tokens: TokenSet | null = parseTokenSet(await response.json());
    return tokens === null ? { ok: false, reason: 'unavailable' } : { ok: true, tokens };
  } catch (error: unknown) {
    console.error('[auth-broker] refresh-token exchange failed: auth-service unreachable', error);
    return { ok: false, reason: 'unavailable' };
  }
}

function purgeExpired(now: number): void {
  recentRotations.forEach((entry, key) => {
    if (now - entry.startedAt >= ROTATION_GRACE_MS) recentRotations.delete(key);
  });
}

export function rotateRefreshToken(refreshToken: string, env: EnvSource = process.env): Promise<RotationResult> {
  const now: number = Date.now();
  purgeExpired(now);
  const key: string = createHash('sha256').update(refreshToken).digest('hex');
  const shared: GraceEntry | undefined = recentRotations.get(key);
  if (shared !== undefined) return shared.result;

  const result: Promise<RotationResult> = requestRotation(refreshToken, env);
  recentRotations.set(key, { startedAt: now, result });
  void result.then((outcome) => {
    if (!outcome.ok) recentRotations.delete(key);
  });
  return result;
}

/** API 2.1.4: needs a Bearer of the token's owner; a failed revoke must not block logout. */
export async function revokeRefreshToken(refreshToken: string, accessToken: string, env: EnvSource = process.env): Promise<boolean> {
  try {
    const response: Response = await fetch(`${resolveAuthBackendUrl(env)}/oauth/token/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ refreshToken, client_id: resolveOauthClientId(env) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return response.ok;
  } catch (error: unknown) {
    console.error('[auth-broker] token revocation failed: auth-service unreachable', error);
    return false;
  }
}

/** Test hook: the grace map is module state. */
export function resetRotationGraceForTests(): void {
  recentRotations.clear();
}
