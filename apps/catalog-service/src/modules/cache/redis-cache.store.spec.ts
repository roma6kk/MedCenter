import { FAIL_FAST_REDIS_OPTIONS } from '@medcenter/common';
import Redis from 'ioredis';

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
    const store = createRedisCacheStore({ REDIS_URL: 'redis://redis:6379' });

    expect(store).toBeInstanceOf(RedisCacheStore);
    expect(Redis).toHaveBeenCalledWith('redis://redis:6379', FAIL_FAST_REDIS_OPTIONS);
    expect(FAIL_FAST_REDIS_OPTIONS.commandTimeout).toBeLessThanOrEqual(300);
    expect(FAIL_FAST_REDIS_OPTIONS.connectTimeout).toBeLessThanOrEqual(2_000);
    expect(FAIL_FAST_REDIS_OPTIONS.enableOfflineQueue).toBe(false);
  });

  it('should bind no store when REDIS_URL is missing', () => {
    const store = createRedisCacheStore({});

    expect(store).toBeNull();
    expect(Redis).not.toHaveBeenCalled();
  });

  it('should bind no store when REDIS_URL is empty', () => {
    const store = createRedisCacheStore({ REDIS_URL: '' });

    expect(store).toBeNull();
  });
});

describe('RedisCacheStore in-flight mark', () => {
  const clientWith = (set: jest.Mock, del: jest.Mock = jest.fn()): RedisCacheStore =>
    new RedisCacheStore({ set, del } as unknown as Redis);

  it('should hand the key out when Redis created it, with the ttl and NX', async () => {
    const set = jest.fn().mockResolvedValue('OK');

    const claimed = await clientWith(set).setIfAbsent('lock', '1', 30);

    expect(claimed).toBe(true);
    expect(set).toHaveBeenCalledWith('lock', '1', 'EX', 30, 'NX');
  });

  it('should refuse the key when it already exists, which Redis answers with null', async () => {
    const set = jest.fn().mockResolvedValue(null);

    const claimed = await clientWith(set).setIfAbsent('lock', '1', 30);

    expect(claimed).toBe(false);
  });

  it('should remove exactly the one key when the mark is released', async () => {
    const del = jest.fn().mockResolvedValue(1);

    await clientWith(jest.fn(), del).delete('lock');

    expect(del).toHaveBeenCalledWith('lock');
  });
});
