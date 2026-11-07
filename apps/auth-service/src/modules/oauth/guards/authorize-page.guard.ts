import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { OAuthError } from '../oauth-error';

const S256_METHOD = 'S256';

const CODE_RESPONSE_TYPE = 'code';

export interface AuthorizeQueryRequest {
  readonly query: Record<string, unknown>;
}

// Missing response_type or response_type=token must not silently yield a code; plain PKCE is never accepted.
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
