import { Reflector } from '@nestjs/core';
import { Role } from '@medcenter/contracts';
import {
  captureHttpException,
  createMockHttpContext,
} from '../../__tests__/mock-context';
import { RequiresRoles } from '../decorators/requires-roles.decorator';
import { RoleGuard } from './role.guard';

class AdminController {
  @RequiresRoles(Role.ADMIN)
  listUsers(): string {
    return 'users';
  }

  anyRole(): string {
    return 'open';
  }
}

describe('RoleGuard', () => {
  const guard = new RoleGuard(new Reflector());

  it('should allow the request when the token role matches the required role', () => {
    const { context } = createMockHttpContext({
      handler: AdminController.prototype.listUsers,
      controller: AdminController,
      request: {
        user: { sub: 'a1', scope: 'user/*.read', role: 'ADMIN', jti: 'j3' },
      },
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should reject with FORBIDDEN_ROLE when the token role differs from the required role', () => {
    const { context } = createMockHttpContext({
      handler: AdminController.prototype.listUsers,
      controller: AdminController,
      request: {
        user: { sub: 'p1', scope: 'patient/*.read', role: 'PATIENT', jti: 'j4' },
      },
    });

    const error = captureHttpException(() => guard.canActivate(context));

    expect(error.getStatus()).toBe(403);
    expect(error.getResponse()).toMatchObject({ errorCode: 'FORBIDDEN_ROLE' });
  });

  it('should reject with UNAUTHENTICATED when a role is required but no claims were attached', () => {
    const { context } = createMockHttpContext({
      handler: AdminController.prototype.listUsers,
      controller: AdminController,
      request: {},
    });

    const error = captureHttpException(() => guard.canActivate(context));

    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toMatchObject({ errorCode: 'UNAUTHENTICATED' });
  });

  it('should allow a route without role metadata to pass through untouched', () => {
    const { context } = createMockHttpContext({
      handler: AdminController.prototype.anyRole,
      controller: AdminController,
      request: {},
    });

    expect(guard.canActivate(context)).toBe(true);
  });
});
