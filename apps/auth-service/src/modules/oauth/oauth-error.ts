import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from '@medcenter/contracts';

export type OAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'invalid_scope'
  | 'unsupported_grant_type';

export interface OAuthErrorBody {
  readonly error: OAuthErrorCode;
  readonly error_description?: string;
  readonly errorCode?: ErrorCode;
}

const INVALID_REQUEST_CODE: ErrorCode = 'VALIDATION_ERROR';
const INVALID_CLIENT_CODE: ErrorCode = 'UNAUTHENTICATED';

export class OAuthError extends HttpException {
  constructor(status: HttpStatus, body: OAuthErrorBody) {
    super(body, status);
  }

  private static of(status: HttpStatus, error: OAuthErrorCode, description: string, errorCode: ErrorCode): OAuthError {
    return new OAuthError(status, { error, error_description: description, errorCode });
  }

  static invalidRequest(description: string): OAuthError {
    return OAuthError.of(HttpStatus.BAD_REQUEST, 'invalid_request', description, INVALID_REQUEST_CODE);
  }

  static invalidClient(description: string): OAuthError {
    return OAuthError.of(HttpStatus.UNAUTHORIZED, 'invalid_client', description, INVALID_CLIENT_CODE);
  }

  static invalidGrant(description: string): OAuthError {
    return OAuthError.of(HttpStatus.BAD_REQUEST, 'invalid_grant', description, INVALID_REQUEST_CODE);
  }

  static invalidScope(description: string): OAuthError {
    return OAuthError.of(HttpStatus.BAD_REQUEST, 'invalid_scope', description, INVALID_REQUEST_CODE);
  }

  static unsupportedGrantType(grantType: string): OAuthError {
    return OAuthError.of(HttpStatus.BAD_REQUEST, 'unsupported_grant_type', `Unsupported grant_type: ${grantType}`, INVALID_REQUEST_CODE);
  }

  // Revoked, rotated and unknown refresh tokens are all 400 invalid_grant: no revoked-vs-unknown oracle; TOKEN_REVOKED (401) belongs to the guard layer.
  static invalidGrantRevoked(): OAuthError {
    return OAuthError.invalidGrant('Refresh token has been revoked or already rotated');
  }
}
