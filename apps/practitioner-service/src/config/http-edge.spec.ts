import { Logger, type ExecutionContext, type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitGuard, setRateLimitStore } from '@medcenter/common';
import Redis from 'ioredis';

import { applyTrustProxy, enableRateLimit } from './http-edge';
import { FAIL_FAST_REDIS_OPTIONS } from './redis-options';

interface FakeRedis {
  readonly on: jest.Mock;
  readonly eval: jest.Mock;
}

const mockRedisClients: FakeRedis[] = [];

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => {
    const client: FakeRedis = { on: jest.fn(), eval: jest.fn().mockResolvedValue(1) };
    mockRedisClients.push(client);
    return client;
  }),
}));

const GUARD_ENV: NodeJS.ProcessEnv = {
  JWT_JWKS_URI: 'http://auth-service:3001/.well-known/jwks.json',
  JWT_ISSUER: 'https://api.medcenter.by',
  REDIS_URL: 'redis://:secret@redis:6379',
};

function publicRequestContext(): ExecutionContext {
  const request = { method: 'GET', originalUrl: '/api/v1/doctors', ip: '203.0.113.7' };
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ header: jest.fn() }) }),
    getHandler: () => enableRateLimit,
    getClass: () => RateLimitGuard,
  } as unknown as ExecutionContext;
}

describe('enableRateLimit', () => {
  beforeEach(() => {
    mockRedisClients.length = 0;
    jest.mocked(Redis).mockClear();
  });

  afterEach(() => {
    setRateLimitStore(null);
  });

  it('should connect with the fail-fast client options when the guard environment is complete', () => {
    // Act
    enableRateLimit(GUARD_ENV, new Logger('test'));

    // Assert
    expect(Redis).toHaveBeenCalledWith(GUARD_ENV['REDIS_URL'], FAIL_FAST_REDIS_OPTIONS);
    expect(FAIL_FAST_REDIS_OPTIONS.commandTimeout).toBeLessThanOrEqual(300);
    expect(FAIL_FAST_REDIS_OPTIONS.enableOfflineQueue).toBe(false);
  });

  it('should make RateLimitGuard count requests in Redis when the store is installed', async () => {
    // Arrange
    enableRateLimit(GUARD_ENV, new Logger('test'));
    const guard = new RateLimitGuard(new Reflector());

    // Act
    const allowed = await guard.canActivate(publicRequestContext());

    // Assert — without the store the guard returns early and never touches Redis.
    expect(allowed).toBe(true);
    expect(mockRedisClients[0]?.eval).toHaveBeenCalledTimes(1);
  });

  it('should log connection errors instead of crashing the process when Redis fails', () => {
    // Arrange
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    enableRateLimit(GUARD_ENV, new Logger('test'));
    const onError = mockRedisClients[0]?.on.mock.calls.find(([event]) => event === 'error')?.[1] as
      | ((error: Error) => void)
      | undefined;

    // Act
    onError?.(new Error('ECONNREFUSED'));

    // Assert
    expect(onError).toBeDefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'));
    warn.mockRestore();
  });

  it('should fail the boot when REDIS_URL is missing from the environment', () => {
    // Act
    const boot = (): void => enableRateLimit({ ...GUARD_ENV, REDIS_URL: undefined }, new Logger('test'));

    // Assert
    expect(boot).toThrow();
    expect(Redis).not.toHaveBeenCalled();
  });
});

describe('applyTrustProxy', () => {
  it('should set the Express trust proxy setting when the app is configured', () => {
    // Arrange
    const set = jest.fn();
    const app = { getHttpAdapter: () => ({ getInstance: () => ({ set }) }) } as unknown as INestApplication;

    // Act
    applyTrustProxy(app, 1);

    // Assert
    expect(set).toHaveBeenCalledWith('trust proxy', 1);
  });
});
