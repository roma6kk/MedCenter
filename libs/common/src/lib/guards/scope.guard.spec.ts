import { Reflector } from '@nestjs/core';
import {
  captureHttpException,
  createMockHttpContext,
} from '../../__tests__/mock-context';
import { RequiresScopes } from '../decorators/requires-scopes.decorator';
import { ScopeGuard } from './scope.guard';

class SchedulesController {
  @RequiresScopes('patient/*.read')
  listForPatient(): string {
    return 'slots';
  }

  listCatalog(): string {
    return 'services';
  }
}

describe('ScopeGuard', () => {
  const guard = new ScopeGuard(new Reflector());

  it('should allow the request when the granted scopes contain the required scope', () => {
    const { context } = createMockHttpContext({
      handler: SchedulesController.prototype.listForPatient,
      controller: SchedulesController,
      request: {
        user: { sub: 'u1', scope: 'patient/*.read', role: 'PATIENT', jti: 'j1' },
      },
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should reject with FORBIDDEN_SCOPE when the required scope is absent', () => {
    const { context } = createMockHttpContext({
      handler: SchedulesController.prototype.listForPatient,
      controller: SchedulesController,
      request: {
        user: { sub: 'u2', scope: 'user/*.read', role: 'DOCTOR', jti: 'j2' },
      },
    });

    const error = captureHttpException(() => guard.canActivate(context));

    expect(error.getStatus()).toBe(403);
    expect(error.getResponse()).toMatchObject({
      errorCode: 'FORBIDDEN_SCOPE',
      message: expect.stringContaining('patient/*.read'),
    });
  });

  it('should reject with UNAUTHENTICATED when scopes are required but no claims were attached', () => {
    const { context } = createMockHttpContext({
      handler: SchedulesController.prototype.listForPatient,
      controller: SchedulesController,
      request: {},
    });

    const error = captureHttpException(() => guard.canActivate(context));

    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toMatchObject({ errorCode: 'UNAUTHENTICATED' });
  });

  it('should allow a route without scope metadata to pass through untouched', () => {
    const { context } = createMockHttpContext({
      handler: SchedulesController.prototype.listCatalog,
      controller: SchedulesController,
      request: {},
    });

    expect(guard.canActivate(context)).toBe(true);
  });
});
