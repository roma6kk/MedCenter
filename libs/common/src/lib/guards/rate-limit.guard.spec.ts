import { Reflector } from '@nestjs/core';
import { clearEnvCache } from '@medcenter/config';
import { captureAsyncHttpException, createMockHttpContext } from '../../__tests__/mock-context';
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

function createOauthContext(
  overrides: Record<string, unknown> = {},
): ReturnType<typeof createMockHttpContext> {
  return createMockHttpContext({
    handler: OauthController.prototype.token,
    controller: OauthController,
    request: {
      headers: {},
      method: 'POST',
      originalUrl: '/oauth/token',
      ip: '127.0.0.1',
      user: { sub: 'client-1', scope: 'launch', role: 'PATIENT', jti: 'j5' },
      ...overrides,
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

  async function keyFor(overrides: Record<string, unknown>): Promise<string> {
    const increment = jest.fn().mockResolvedValue(1);
    setRateLimitStore({ increment });
    await guard.canActivate(createOauthContext(overrides).context);
    return String(increment.mock.calls[0]?.[0] ?? '');
  }

  it('should key the token endpoint budget on client_id and ip when no principal exists', async () => {
    // M2: `POST /oauth/token` is `@Public()`, so `user` is undefined on the
    // wire. The unauthenticated body `client_id` is combined with the IP, never
    // substituted for it.
    const key = await keyFor({ user: undefined, body: { client_id: 'medcenter-web' } });

    expect(key.startsWith('medcenter-web|127.0.0.1:POST:/oauth/token:')).toBe(true);
  });

  it('should keep the ip in the key when one ip rotates client_id', async () => {
    const first = await keyFor({ user: undefined, body: { client_id: 'x1' } });
    const second = await keyFor({ user: undefined, body: { client_id: 'x2' } });

    expect(first).toContain('|127.0.0.1:');
    expect(second).toContain('|127.0.0.1:');
  });

  it('should not let another ip exhaust the bucket of a real client_id', async () => {
    const victim = await keyFor({ user: undefined, body: { client_id: 'medcenter-web' } });
    const attacker = await keyFor({
      user: undefined,
      ip: '203.0.113.9',
      body: { client_id: 'medcenter-web' },
    });

    expect(attacker).not.toBe(victim);
  });

  it('should ignore the body client_id when an authenticated principal exists', async () => {
    // e.g. `POST /oauth/token/revoke` accepts `client_id` from a signed-in user.
    const first = await keyFor({ body: { client_id: 'x1' } });
    const second = await keyFor({ body: { client_id: 'x2' } });

    expect(first.startsWith('client-1:POST:/oauth/token:')).toBe(true);
    expect(second).toBe(first);
  });

  it('should cap an oversized client_id in the key', async () => {
    const key = await keyFor({ user: undefined, body: { client_id: 'a'.repeat(10_000) } });

    expect(key.startsWith(`${'a'.repeat(64)}|127.0.0.1:`)).toBe(true);
  });

  it('should fall back to the ip alone when neither a principal nor a client_id exists', async () => {
    const key = await keyFor({ user: undefined });

    expect(key.startsWith('-|127.0.0.1:POST:/oauth/token:')).toBe(true);
  });

  it('should share one bucket across query strings on the same route', async () => {
    // Query strings must not split the budget, or `?n=1`, `?n=2`, … bypass the limit.
    const first = await keyFor({ user: undefined, originalUrl: '/oauth/token?n=1' });
    const second = await keyFor({ user: undefined, originalUrl: '/oauth/token?n=2' });

    expect(first).toBe(second);
    expect(first).not.toContain('?');
  });

  it('should give a different bucket to a different client_id behind the same ip', async () => {
    const increment = jest.fn().mockResolvedValue(1);
    const store: RateLimitStore = { increment };
    setRateLimitStore(store);
    const first = createOauthContext({ user: undefined, body: { client_id: 'client-a' } });
    const second = createOauthContext({ user: undefined, body: { client_id: 'client-b' } });

    await guard.canActivate(first.context);
    await guard.canActivate(second.context);

    const firstKey = String(increment.mock.calls[0]?.[0] ?? '');
    const secondKey = String(increment.mock.calls[1]?.[0] ?? '');
    expect(firstKey).not.toBe(secondKey);
  });
});
