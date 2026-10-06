import { Reflector } from '@nestjs/core';
import { clearEnvCache } from '@medcenter/config';
import {
  captureAsyncHttpException,
  createMockHttpContext,
} from '../../__tests__/mock-context';
import { RateLimit } from '../decorators/rate-limit.decorator';
import { RateLimitGuard, type RateLimitStore, setRateLimitStore } from './rate-limit.guard';

class OauthController {
  @RateLimit(20)
  token(): string {
    return 'token';
  }
}

function givenGuardEnvironment(): void {
  process.env['JWT_JWKS_URI'] = 'https://api.medcenter.by/.well-known/jwks.json';
  process.env['JWT_ISSUER'] = 'https://api.medcenter.by';
  process.env['REDIS_URL'] = 'redis://localhost:6379';
  clearEnvCache();
}

function createOauthContext(): ReturnType<typeof createMockHttpContext> {
  return createMockHttpContext({
    handler: OauthController.prototype.token,
    controller: OauthController,
    request: {
      headers: {},
      method: 'POST',
      originalUrl: '/oauth/token',
      ip: '127.0.0.1',
      user: { sub: 'client-1', scope: 'launch', role: 'PATIENT', jti: 'j5' },
    },
  });
}

describe('RateLimitGuard', () => {
  const guard = new RateLimitGuard(new Reflector());

  beforeAll(givenGuardEnvironment);

  afterEach(() => {
    setRateLimitStore(null);
  });

  it('should allow the request while the per-minute budget remains', async () => {
    const store: RateLimitStore = { increment: jest.fn().mockResolvedValue(1) };
    setRateLimitStore(store);
    const { context } = createOauthContext();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(store.increment).toHaveBeenCalledTimes(1);
  });

  it('should reject with 429 RATE_LIMITED and Retry-After when the budget is exhausted', async () => {
    const store: RateLimitStore = { increment: jest.fn().mockResolvedValue(21) };
    setRateLimitStore(store);
    const { context, response } = createOauthContext();

    const error = await captureAsyncHttpException(() => guard.canActivate(context));

    expect(error.getStatus()).toBe(429);
    expect(error.getResponse()).toMatchObject({ errorCode: 'RATE_LIMITED' });
    expect(response.header).toHaveBeenCalledWith('Retry-After', '60');
  });

  it('should fail open when the rate-limit store is unreachable', async () => {
    const store: RateLimitStore = {
      increment: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };
    setRateLimitStore(store);
    const { context } = createOauthContext();

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
