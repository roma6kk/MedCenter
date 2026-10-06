import { Reflector } from '@nestjs/core';
import {
  captureAsyncHttpException,
  createMockHttpContext,
} from '../../__tests__/mock-context';
import { Public } from '../decorators/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

class HealthController {
  @Public()
  health(): string {
    return 'ok';
  }
}

class MeController {
  me(): string {
    return 'me';
  }
}

describe('JwtAuthGuard', () => {
  const guard = new JwtAuthGuard(new Reflector());

  it('should reject with 401 UNAUTHENTICATED when no bearer token is presented to a protected route', async () => {
    const { context } = createMockHttpContext({
      handler: MeController.prototype.me,
      controller: MeController,
      request: { headers: {} },
    });

    const error = await captureAsyncHttpException(() => guard.canActivate(context));

    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toMatchObject({ errorCode: 'UNAUTHENTICATED' });
  });

  it('should reject with 401 when the Authorization header is not a bearer scheme', async () => {
    const { context } = createMockHttpContext({
      handler: MeController.prototype.me,
      controller: MeController,
      request: { headers: { authorization: 'Basic dXNlcjpwYXNzd29yZA==' } },
    });

    const error = await captureAsyncHttpException(() => guard.canActivate(context));

    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toMatchObject({ errorCode: 'UNAUTHENTICATED' });
  });

  it('should allow a @Public route to be reached without any token', async () => {
    const { context } = createMockHttpContext({
      handler: HealthController.prototype.health,
      controller: HealthController,
      request: { headers: {} },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
