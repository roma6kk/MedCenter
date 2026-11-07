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

  static invalidRequest(description: string): OAuthError {
    return new OAuthError(HttpStatus.BAD_REQUEST, {
      error: 'invalid_request',
      error_description: description,
      errorCode: INVALID_REQUEST_CODE,
    });
  }

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

  // Revoked, rotated and unknown refresh tokens are all 400 invalid_grant: no revoked-vs-unknown oracle; TOKEN_REVOKED (401) belongs to the guard layer.
  static invalidGrantRevoked(): OAuthError {
    return new OAuthError(HttpStatus.BAD_REQUEST, {
      error: 'invalid_grant',
      error_description: 'Refresh token has been revoked or already rotated',
      errorCode: INVALID_REQUEST_CODE,
    });
  }
}
