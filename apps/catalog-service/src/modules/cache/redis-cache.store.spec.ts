import Redis from 'ioredis';

import { FAIL_FAST_REDIS_OPTIONS } from '../../config/redis-options';
import { createRedisCacheStore, RedisCacheStore } from './redis-cache.store';

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ on: jest.fn(), get: jest.fn(), quit: jest.fn() })),
}));

describe('createRedisCacheStore', () => {
  beforeEach(() => {
    jest.mocked(Redis).mockClear();
  });

  it('should connect with the fail-fast options when REDIS_URL is set', () => {
    // Act
    const store = createRedisCacheStore({ REDIS_URL: 'redis://redis:6379' });

    // Assert — the defaults would hold a request for ioredis' 10 s connect timeout.
    expect(store).toBeInstanceOf(RedisCacheStore);
    expect(Redis).toHaveBeenCalledWith('redis://redis:6379', FAIL_FAST_REDIS_OPTIONS);
    expect(FAIL_FAST_REDIS_OPTIONS.commandTimeout).toBeLessThanOrEqual(300);
    expect(FAIL_FAST_REDIS_OPTIONS.connectTimeout).toBeLessThanOrEqual(2_000);
    expect(FAIL_FAST_REDIS_OPTIONS.enableOfflineQueue).toBe(false);
  });

  it('should bind no store when REDIS_URL is missing', () => {
    // Act
    const store = createRedisCacheStore({});

    // Assert
    expect(store).toBeNull();
    expect(Redis).not.toHaveBeenCalled();
  });

  it('should bind no store when REDIS_URL is empty', () => {
    // Act
    const store = createRedisCacheStore({ REDIS_URL: '' });

    // Assert
    expect(store).toBeNull();
  });
});
