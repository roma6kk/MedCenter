import Redis from 'ioredis';

import { createRedisIdempotencyStore, RedisIdempotencyStore, type RedisLikeClient } from './redis-idempotency.store';

jest.mock('ioredis', () => ({ __esModule: true, default: jest.fn() }));

const RedisMock = Redis as unknown as jest.Mock;

function fakeClient(status: string): jest.Mocked<RedisLikeClient> & { status: string } {
  return {
    status,
    get: jest.fn().mockResolvedValue('cached'),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue('OK'),
    disconnect: jest.fn(),
    on: jest.fn(),
  } as unknown as jest.Mocked<RedisLikeClient> & { status: string };
}

describe('RedisIdempotencyStore', () => {
  it('should read through the client and write with a TTL in seconds when a response is cached', async () => {
    const client = fakeClient('ready');
    const store = new RedisIdempotencyStore(client);

    const value = await store.get('idempotency:u-1:k-1');
    await store.set('idempotency:u-1:k-1', '{"x":1}', 86_400);

    expect(value).toBe('cached');
    expect(client.set).toHaveBeenCalledWith('idempotency:u-1:k-1', '{"x":1}', 'EX', 86_400);
  });

  it('should claim the in-flight mark with SET NX EX and report whether the key was free', async () => {
    const client = fakeClient('ready');
    client.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
    const store = new RedisIdempotencyStore(client);

    const first = await store.setIfAbsent('idempotency:u-1:k-1:lock', '1', 30);
    const second = await store.setIfAbsent('idempotency:u-1:k-1:lock', '1', 30);

    expect([first, second]).toEqual([true, false]);
    expect(client.set).toHaveBeenCalledWith('idempotency:u-1:k-1:lock', '1', 'EX', 30, 'NX');
  });

  it('should delete the in-flight mark when the request ends', async () => {
    const client = fakeClient('ready');
    const store = new RedisIdempotencyStore(client);

    await store.delete('idempotency:u-1:k-1:lock');

    expect(client.del).toHaveBeenCalledWith('idempotency:u-1:k-1:lock');
  });

  it('should quit gracefully when the connection is ready at shutdown', async () => {
    const client = fakeClient('ready');
    const store = new RedisIdempotencyStore(client);

    await store.onModuleDestroy();

    expect(client.quit).toHaveBeenCalledTimes(1);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('should drop the connection without connecting when it was never used before shutdown', async () => {
    const client = fakeClient('wait');
    const store = new RedisIdempotencyStore(client);

    await store.onModuleDestroy();

    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(client.quit).not.toHaveBeenCalled();
  });
});

describe('createRedisIdempotencyStore', () => {
  beforeEach(() => {
    RedisMock.mockReset();
    RedisMock.mockImplementation(() => fakeClient('wait'));
  });

  it('should refuse to start when REDIS_URL is missing', () => {
    const env: NodeJS.ProcessEnv = {};

    const create = (): unknown => createRedisIdempotencyStore(env);

    expect(create).toThrow('REDIS_URL');
  });

  it('should connect lazily and observe connection errors when the store is created', () => {
    const env: NodeJS.ProcessEnv = { REDIS_URL: 'redis://redis:6379' };

    createRedisIdempotencyStore(env);

    expect(RedisMock).toHaveBeenCalledWith('redis://redis:6379', expect.objectContaining({ lazyConnect: true }));
    const client = RedisMock.mock.results[0]?.value as { on: jest.Mock };
    expect(client.on).toHaveBeenCalledWith('error', expect.any(Function));
  });
});
