const mockRedis = jest.fn();
jest.mock('ioredis', () => ({
  __esModule: true,
  default: function Redis(...args: unknown[]): unknown {
    return mockRedis(...args);
  },
}));

import { Logger } from '@nestjs/common';
import { clearEnvCache } from '@medcenter/config';
import { enableRateLimit, FAIL_FAST_REDIS_OPTIONS } from './enable-rate-limit';
import { setRateLimitStore } from './rate-limit.guard';

describe('enableRateLimit', () => {
  afterEach(() => {
    setRateLimitStore(null);
    clearEnvCache();
  });

  it('should open the limiter connection with fail-fast options so a hung Redis cannot hold requests', () => {
    // Arrange
    mockRedis.mockReset().mockReturnValue({ on: jest.fn() });
    const env = {
      JWT_JWKS_URI: 'http://auth-service:3001/.well-known/jwks.json',
      JWT_ISSUER: 'https://api.medcenter.by',
      REDIS_URL: 'redis://redis:6379',
    };

    // Act
    enableRateLimit(env, new Logger('test'));

    // Assert
    expect(mockRedis).toHaveBeenCalledWith('redis://redis:6379', FAIL_FAST_REDIS_OPTIONS);
    expect(FAIL_FAST_REDIS_OPTIONS.commandTimeout).toBeGreaterThan(0);
  });

  it('should throw when REDIS_URL is missing so the boot fails at once', () => {
    expect(() => enableRateLimit({}, new Logger('test'))).toThrow();
  });
});
