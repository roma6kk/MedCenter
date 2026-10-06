import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { OAuthError } from '../oauth-error';

const S256_METHOD = 'S256';

export interface AuthorizeQueryRequest {
  readonly query: Record<string, unknown>;
}

/**
 * Front gate of `GET /oauth/authorize` (API 2.1.2): a `code_challenge` is
 * mandatory and only `code_challenge_method=S256` is accepted — `plain` is
 * never an option for this server.
 *
 * Raises `OAuthError` (not a bare `BadRequestException`) so the failure leaves as
 * the RFC 6749 `{error, error_description}` envelope its callers expect.
 */
@Injectable()
export class AuthorizePageGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthorizeQueryRequest>();
    const method = request.query['code_challenge_method'];
    const challenge = request.query['code_challenge'];

    if (method !== S256_METHOD) {
      throw OAuthError.invalidRequest('code_challenge_method must be S256');
    }
    if (typeof challenge !== 'string' || challenge.length === 0) {
      throw OAuthError.invalidRequest('code_challenge is required');
    }
    return true;
  }
}
