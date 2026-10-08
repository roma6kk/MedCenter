import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { OAuthError } from '../oauth-error';

const S256_METHOD = 'S256';

/** The only response type this server issues (see `response_types_supported`). */
const CODE_RESPONSE_TYPE = 'code';

export interface AuthorizeQueryRequest {
  readonly query: Record<string, unknown>;
}

/**
 * Front gate of `GET /oauth/authorize` (API 2.1.2): a `code_challenge` is
 * mandatory and only `code_challenge_method=S256` is accepted — `plain` is
 * never an option for this server.
 *
 * N4: `response_type` is validated too. It is REQUIRED (RFC 6749 §4.1.1) and
 * discovery advertises `response_types_supported: ['code']`, so a missing value
 * or `response_type=token` must not silently yield a code — both are rejected
 * as `invalid_request`.
 *
 * Raises `OAuthError` (not a bare `BadRequestException`) so the failure leaves as
 * the RFC 6749 `{error, error_description}` envelope its callers expect.
 */
@Injectable()
export class AuthorizePageGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthorizeQueryRequest>();
    const responseType = request.query['response_type'];
    const method = request.query['code_challenge_method'];
    const challenge = request.query['code_challenge'];

    if (responseType !== CODE_RESPONSE_TYPE) {
      throw OAuthError.invalidRequest('response_type must be code');
    }
    if (method !== S256_METHOD) {
      throw OAuthError.invalidRequest('code_challenge_method must be S256');
    }
    if (typeof challenge !== 'string' || challenge.length === 0) {
      throw OAuthError.invalidRequest('code_challenge is required');
    }
    return true;
  }
}
