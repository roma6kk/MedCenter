import type { JwtClaims } from '../request-context';

export interface TokenRevocationChecker {
  /** A key is a token's `jti` or its session `sid`. An unknown key means not revoked: never fail closed on a miss. */
  isRevoked(key: string): Promise<boolean>;
}

export const TOKEN_REVOCATION = 'TOKEN_REVOCATION';

export function revocationKeysOf(claims: JwtClaims): ReadonlyArray<string> {
  const keys = [claims.jti, claims.sid].filter((key): key is string => typeof key === 'string');
  return [...new Set(keys)];
}

export const DENYLIST_KEY_PREFIX = 'oauth:deny:';
export const SESSION_DENYLIST_NAMESPACE = 'session:';
