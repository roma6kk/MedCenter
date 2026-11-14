// Refresh tokens are single-use: concurrent requests with one cookie (StrictMode, several tabs) share one rotation for a short grace window.
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

function payloadFromAccessToken(accessToken: string, expiresAt: string): SessionPayload {
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

export const CACHED_TOKEN_MARGIN_MS = 60_000;

export function readCachedSession(accessToken: string | undefined, now: number = Date.now()): SessionPayload | null {
  if (accessToken === undefined || accessToken.length === 0) return null;
  const claims: JwtClaims | null = decodeJwtPayload(accessToken);
  if (claims === null || typeof claims.exp !== 'number') return null;
  const expiresAtMs = claims.exp * 1000;
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
  const now = Date.now();
  purgeExpired(now);
  const key = createHash('sha256').update(refreshToken).digest('hex');
  const shared: GraceEntry | undefined = recentRotations.get(key);
  if (shared !== undefined) return shared.result;

  const result: Promise<RotationResult> = requestRotation(refreshToken, env);
  recentRotations.set(key, { startedAt: now, result });
  void result.then((outcome) => {
    if (!outcome.ok) recentRotations.delete(key);
  });
  return result;
}

export async function revokeRefreshToken(refreshToken: string, accessToken: string, env: EnvSource = process.env, reason?: 'idle'): Promise<boolean> {
  try {
    const response: Response = await fetch(`${resolveAuthBackendUrl(env)}/oauth/token/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ refreshToken, client_id: resolveOauthClientId(env), ...(reason !== undefined ? { reason } : {}) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return response.ok;
  } catch (error: unknown) {
    console.error('[auth-broker] token revocation failed: auth-service unreachable', error);
    return false;
  }
}

export type ActivityResult = 'recorded' | 'idle' | 'unauthorized' | 'unavailable';

export async function recordSessionActivity(accessToken: string, env: EnvSource = process.env): Promise<ActivityResult> {
  try {
    const response: Response = await fetch(`${resolveAuthBackendUrl(env)}/oauth/token/activity`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 401) return 'unauthorized';
    if (!response.ok) return 'unavailable';
    const body = (await response.json().catch(() => null)) as { readonly recorded?: unknown } | null;
    return body?.recorded === false ? 'idle' : 'recorded';
  } catch (error: unknown) {
    console.error('[auth-broker] activity ping failed: auth-service unreachable', error);
    return 'unavailable';
  }
}

export function resetRotationGraceForTests(): void {
  recentRotations.clear();
}
