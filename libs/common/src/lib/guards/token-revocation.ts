import type { JwtClaims } from '../request-context';

/**
 * Lookup for tokens that were **explicitly revoked** (RFC 7009 `/oauth/token/revoke`
 * or a logout) and must therefore stop being accepted by the shared guard stack.
 *
 * The contract lives here, next to `JwtAuthGuard`, because every BFF service runs
 * that guard (ADR-009) and has to ask the same question; the *store* does not,
 * because only the issuer knows what it revoked. `auth-service` therefore binds
 * this token to its denylist (Redis in production) and exports it, and
 * `libs/common` stays free of any dependency on the issuer.
 *
 * Reuse detection is deliberately **not** part of this contract: a rotated or
 * already-consumed refresh token is a token-endpoint concern (RFC 6749
 * `invalid_grant`), and answering 401 here would end a session the client is
 * still legitimately using.
 */
export interface TokenRevocationChecker {
  /**
   * `true` when `key` was explicitly revoked. `key` is a token's `jti` or the
   * `sid` of the pair it belongs to. An unknown key means *not revoked* — callers
   * must never fail closed on a miss.
   */
  isRevoked(key: string): Promise<boolean>;
}

/** DI token for the {@link TokenRevocationChecker} the guard layer resolves. */
export const TOKEN_REVOCATION = 'TOKEN_REVOCATION';

/**
 * Every key a verified access token can be revoked *by*: its own `jti` (a direct
 * revocation) and its session `sid` (revoking the paired refresh token), so a
 * logout invalidates the still-live access token as well.
 */
export function revocationKeysOf(claims: JwtClaims): ReadonlyArray<string> {
  const keys = [claims.jti, claims.sid].filter((key): key is string => typeof key === 'string');
  return [...new Set(keys)];
}
