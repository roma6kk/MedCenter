import { Reflector } from '@nestjs/core';
import { clearEnvCache } from '@medcenter/config';
import { captureAsyncHttpException, createMockHttpContext } from '../../__tests__/mock-context';
import { RateLimit } from '../decorators/rate-limit.decorator';
import {
  RATE_LIMIT_STORE_TIMEOUT_MS,
  RateLimitGuard,
  type RateLimitStore,
  setRateLimitStore,
} from './rate-limit.guard';

class OauthController {
  @RateLimit(20)
  token(): string {
    return 'token';
  }
}

class CredentialController {
  @RateLimit(2, { perAddressCeiling: 5 })
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
      route: { path: '/oauth/token' },
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

  it('should share one bucket across values of a path parameter on the same route', async () => {
    const first = await keyFor({ route: { path: '/doctors/:id' }, originalUrl: '/doctors/a' });
    const second = await keyFor({ route: { path: '/doctors/:id' }, originalUrl: '/doctors/b' });

    expect(first).toBe(second);
    expect(first).toContain(':POST:/doctors/:id:');
  });

  it('should fall back to the handler name when the adapter exposes no route template', async () => {
    const key = await keyFor({ route: undefined });

    expect(key).toContain(':POST:OauthController.token:');
  });

  it('should fail open when the store never answers', async () => {
    jest.useFakeTimers();
    try {
      setRateLimitStore({ increment: jest.fn().mockReturnValue(new Promise<number>(() => undefined)) });
      const { context } = createOauthContext();

      const result = guard.canActivate(context);
      await jest.advanceTimersByTimeAsync(RATE_LIMIT_STORE_TIMEOUT_MS + 1);

      await expect(result).resolves.toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  describe('token endpoint keyed by credential', () => {
    function createCredentialContext(body: Record<string, unknown>, ip = '10.0.0.1'): ReturnType<typeof createMockHttpContext> {
      return createMockHttpContext({
        handler: CredentialController.prototype.token,
        controller: CredentialController,
        request: { headers: {}, method: 'POST', route: { path: '/oauth/token' }, ip, body },
      });
    }

    function countingStore(): RateLimitStore {
      const hits = new Map<string, number>();
      return {
        increment: async (key: string): Promise<number> => {
          const next = (hits.get(key) ?? 0) + 1;
          hits.set(key, next);
          return next;
        },
      };
    }

    it('should let clients behind one address use their own codes without sharing a bucket', async () => {
      setRateLimitStore(countingStore());

      for (let i = 0; i < 4; i += 1) {
        const body = { grant_type: 'authorization_code', client_id: 'medcenter-web', code: `code-${i}` };
        await expect(guard.canActivate(createCredentialContext(body).context)).resolves.toBe(true);
      }
    });

    it('should answer 429 once the same credential is replayed past the budget, from any address', async () => {
      setRateLimitStore(countingStore());
      const body = { grant_type: 'refresh_token', client_id: 'medcenter-web', refresh_token: 'rt-1' };
      await guard.canActivate(createCredentialContext(body, '10.0.0.1').context);
      await guard.canActivate(createCredentialContext(body, '10.0.0.2').context);

      const error = await captureAsyncHttpException(() => guard.canActivate(createCredentialContext(body, '10.0.0.3').context));

      expect(error.getStatus()).toBe(429);
    });

    it('should answer 429 when one address passes the ceiling with ever-new credentials', async () => {
      setRateLimitStore(countingStore());
      for (let i = 0; i < 5; i += 1) {
        const body = { grant_type: 'authorization_code', client_id: 'c', code: `code-${i}` };
        await guard.canActivate(createCredentialContext(body).context);
      }

      const body = { grant_type: 'authorization_code', client_id: 'c', code: 'code-new' };
      const error = await captureAsyncHttpException(() => guard.canActivate(createCredentialContext(body).context));

      expect(error.getStatus()).toBe(429);
    });

    it('should never put the raw code or refresh token into the store key', async () => {
      const increment = jest.fn().mockResolvedValue(1);
      setRateLimitStore({ increment });

      await guard.canActivate(
        createCredentialContext({ grant_type: 'refresh_token', client_id: 'c', refresh_token: 'super-secret-token' }).context,
      );

      const keys = increment.mock.calls.map((call) => String(call[0]));
      expect(keys.some((key) => key.includes('super-secret-token'))).toBe(false);
      expect(keys.some((key) => key.startsWith('c|refresh_token|'))).toBe(true);
    });

    it('should fall back to client_id and ip when the request carries no credential', async () => {
      const increment = jest.fn().mockResolvedValue(1);
      setRateLimitStore({ increment });

      await guard.canActivate(createCredentialContext({ grant_type: 'authorization_code', client_id: 'c' }).context);

      expect(increment).toHaveBeenCalledTimes(1);
      expect(String(increment.mock.calls[0]?.[0]).startsWith('c|10.0.0.1:POST:/oauth/token:')).toBe(true);
    });
  });
});
