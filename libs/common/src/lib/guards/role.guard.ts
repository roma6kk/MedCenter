import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@medcenter/contracts';
import { REQUIRES_ROLES_KEY } from '../decorators/requires-roles.decorator';
import type { RequestWithClaims } from '../request-context';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
      REQUIRES_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiredRoles === undefined || requiredRoles.length === 0) {
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

    if (!requiredRoles.some((role) => role === claims.role)) {
      throw new ForbiddenException({
        errorCode: 'FORBIDDEN_ROLE',
        message: `Role ${requiredRoles.join(' or ')} is required`,
      });
    }
    return true;
  }
}
