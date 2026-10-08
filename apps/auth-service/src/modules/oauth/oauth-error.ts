import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from '@medcenter/contracts';

/**
 * Error discriminators defined by RFC 6749 §5.2. SMART clients branch on these
 * exact strings, so they must survive to the wire — `ProblemDetailsFilter` is
 * deliberately bypassed for this surface (see `OAuthErrorFilter`).
 */
export type OAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'invalid_scope'
  | 'unsupported_grant_type';

export interface OAuthErrorBody {
  /** RFC 6749 error code. */
  readonly error: OAuthErrorCode;
  /** Human-readable detail; RFC 6749 `error_description`. */
  readonly error_description?: string;
  /**
   * Catalogue code from `@medcenter/contracts`, carried alongside the RFC fields
   * so the frontend keeps its existing error-code mapping.
   */
  readonly errorCode?: ErrorCode;
}

const INVALID_REQUEST_CODE: ErrorCode = 'VALIDATION_ERROR';
const INVALID_CLIENT_CODE: ErrorCode = 'UNAUTHENTICATED';

/**
 * An error raised by the SMART/OAuth2 surface. Carries the RFC 6749 envelope in
 * `getResponse()` and is rendered by `OAuthErrorFilter` — never by the global
 * `ProblemDetailsFilter`.
 */
export class OAuthError extends HttpException {
  constructor(status: HttpStatus, body: OAuthErrorBody) {
    super(body, status);
  }

  static invalidRequest(description: string): OAuthError {
    return new OAuthError(HttpStatus.BAD_REQUEST, {
      error: 'invalid_request',
      error_description: description,
      errorCode: INVALID_REQUEST_CODE,
    });
  }

  /** 401: the `client_id` is unknown or the client secret did not verify. */
  static invalidClient(description: string): OAuthError {
    return new OAuthError(HttpStatus.UNAUTHORIZED, {
      error: 'invalid_client',
      error_description: description,
      errorCode: INVALID_CLIENT_CODE,
    });
  }

  static invalidGrant(description: string): OAuthError {
    return new OAuthError(HttpStatus.BAD_REQUEST, {
      error: 'invalid_grant',
      error_description: description,
      errorCode: INVALID_REQUEST_CODE,
    });
  }

  static invalidScope(description: string): OAuthError {
    // RFC 6749 §4.1.2.1 / §5.2: the client asked for a scope it was never
    // granted. No catalogue code fits this one better than the generic
    // validation code, and the RFC `error` discriminator is what the SMART
    // client branches on (M5, R7).
    return new OAuthError(HttpStatus.BAD_REQUEST, {
      error: 'invalid_scope',
      error_description: description,
      errorCode: INVALID_REQUEST_CODE,
    });
  }

  static unsupportedGrantType(grantType: string): OAuthError {
    return new OAuthError(HttpStatus.BAD_REQUEST, {
      error: 'unsupported_grant_type',
      error_description: `Unsupported grant_type: ${grantType}`,
      errorCode: INVALID_REQUEST_CODE,
    });
  }

  /**
   * A refresh token that was revoked or already rotated (its `jti` is in the
   * revocation denylist) is reported exactly like any other unusable refresh
   * token: **400 `invalid_grant`** per RFC 6749 §5.2 / `specs/api-designer-spec.md`
   * §2.1.3, which enumerates only `200 · 400 · 401 (invalid_client) · 429` for
   * this endpoint. `TOKEN_REVOKED` is deliberately *not* surfaced here — it is a
   * 401 catalogue code owned by the guard layer, where a denied access-token
   * `jti` is unambiguous (see `JwtClaims.jti`). Keeping the two distinct avoids
   * a revoked-vs-unknown oracle on the token endpoint and matches the contract
   * a SMART client is built against.
   */
  static invalidGrantRevoked(): OAuthError {
    return new OAuthError(HttpStatus.BAD_REQUEST, {
      error: 'invalid_grant',
      error_description: 'Refresh token has been revoked or already rotated',
      errorCode: INVALID_REQUEST_CODE,
    });
  }
}
