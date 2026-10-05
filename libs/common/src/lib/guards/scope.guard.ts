import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRES_SCOPES_KEY } from '../decorators/requires-scopes.decorator';
import { hasScope, type RequestWithClaims } from '../request-context';

@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRES_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiredScopes === undefined || requiredScopes.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithClaims>();
    const claims = request.user;
    if (claims === undefined) {
      throw new UnauthorizedException({
        errorCode: 'UNAUTHENTICATED',
        message: 'Authentication claims are missing',
      });
    }

    const missing = requiredScopes.find((scope) => !hasScope(claims, scope));
    if (missing !== undefined) {
      throw new ForbiddenException({
        errorCode: 'FORBIDDEN_SCOPE',
        message: `Missing required scope ${missing}`,
      });
    }
    return true;
  }
}
