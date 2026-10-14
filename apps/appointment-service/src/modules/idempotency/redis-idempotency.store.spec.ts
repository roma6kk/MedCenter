import Redis from 'ioredis';

import { createRedisIdempotencyStore, RedisIdempotencyStore, type RedisLikeClient } from './redis-idempotency.store';

jest.mock('ioredis', () => ({ __esModule: true, default: jest.fn() }));

const RedisMock = Redis as unknown as jest.Mock;

function fakeClient(status: string): jest.Mocked<RedisLikeClient> & { status: string } {
  return {
    status,
    get: jest.fn().mockResolvedValue('cached'),
    set: jest.fn().mockResolvedValue('OK'),
    quit: jest.fn().mockResolvedValue('OK'),
    disconnect: jest.fn(),
    on: jest.fn(),
  } as unknown as jest.Mocked<RedisLikeClient> & { status: string };
}

describe('RedisIdempotencyStore', () => {
  it('should read through the client and write with a TTL in seconds when a response is cached', async () => {
    // Arrange
    const client = fakeClient('ready');
    const store = new RedisIdempotencyStore(client);

    // Act
    const value = await store.get('idempotency:u-1:k-1');
    await store.set('idempotency:u-1:k-1', '{"x":1}', 86_400);

    // Assert
    expect(value).toBe('cached');
    expect(client.set).toHaveBeenCalledWith('idempotency:u-1:k-1', '{"x":1}', 'EX', 86_400);
  });

  it('should quit gracefully when the connection is ready at shutdown', async () => {
    // Arrange
    const client = fakeClient('ready');
    const store = new RedisIdempotencyStore(client);

    // Act
    await store.onModuleDestroy();

    // Assert
    expect(client.quit).toHaveBeenCalledTimes(1);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('should drop the connection without connecting when it was never used before shutdown', async () => {
    // Arrange
    const client = fakeClient('wait');
    const store = new RedisIdempotencyStore(client);

    // Act
    await store.onModuleDestroy();

    // Assert
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
    // Arrange
    const env: NodeJS.ProcessEnv = {};

    // Act
    const create = (): unknown => createRedisIdempotencyStore(env);

    // Assert
    expect(create).toThrow('REDIS_URL');
  });

  it('should connect lazily and observe connection errors when the store is created', () => {
    // Arrange
    const env: NodeJS.ProcessEnv = { REDIS_URL: 'redis://redis:6379' };

    // Act
    createRedisIdempotencyStore(env);

    // Assert
    expect(RedisMock).toHaveBeenCalledWith('redis://redis:6379', expect.objectContaining({ lazyConnect: true }));
    const client = RedisMock.mock.results[0]?.value as { on: jest.Mock };
    expect(client.on).toHaveBeenCalledWith('error', expect.any(Function));
  });
});
