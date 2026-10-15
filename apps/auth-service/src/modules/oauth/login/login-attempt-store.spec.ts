import {
  InMemoryLoginAttemptStore,
  RedisLoginAttemptStore,
  createLoginAttemptStore,
  type RedisAttemptClient,
} from './login-attempt-store';

const WINDOW = 900;

describe('InMemoryLoginAttemptStore', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should count the attempts of one key when they fall in the same window', async () => {
    const store = new InMemoryLoginAttemptStore();

    const counts = [await store.record('a', WINDOW), await store.record('a', WINDOW), await store.record('a', WINDOW)];

    expect(counts).toEqual([1, 2, 3]);
  });

  it('should keep the counters of different keys apart', async () => {
    const store = new InMemoryLoginAttemptStore();
    await store.record('a', WINDOW);

    await expect(store.record('b', WINDOW)).resolves.toBe(1);
  });

  it('should start a new window when the previous one has expired', async () => {
    const store = new InMemoryLoginAttemptStore();
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    await store.record('a', WINDOW);
    await store.record('a', WINDOW);

    clock.mockReturnValue(now + WINDOW * 1000 + 1);

    await expect(store.record('a', WINDOW)).resolves.toBe(1);
  });

  it('should forget the attempts of a key when it is cleared', async () => {
    const store = new InMemoryLoginAttemptStore();
    await store.record('a', WINDOW);

    await store.clear('a');

    await expect(store.record('a', WINDOW)).resolves.toBe(1);
  });

  it('should evict the oldest key instead of growing without limit when too many keys are tracked', async () => {
    const store = new InMemoryLoginAttemptStore();
    await store.record('first', WINDOW);
    for (let index = 0; index < 10_000; index += 1) {
      await store.record(`key-${index}`, WINDOW);
    }

    await expect(store.record('first', WINDOW)).resolves.toBe(1);
  });
});

function fakeRedis(): jest.Mocked<RedisAttemptClient> {
  return {
    eval: jest.fn().mockResolvedValue(3),
    del: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue('OK'),
  };
}

describe('RedisLoginAttemptStore', () => {
  it('should increment a prefixed key with the window as its TTL when an attempt is recorded', async () => {
    const redis = fakeRedis();

    const attempts = await new RedisLoginAttemptStore(redis).record('abc', WINDOW);

    expect(attempts).toBe(3);
    expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining('INCR'), 1, 'auth:login-attempts:abc', '900');
  });

  it('should reject when Redis is unreachable so that the caller can fail closed', async () => {
    const redis = fakeRedis();
    redis.eval.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(new RedisLoginAttemptStore(redis).record('abc', WINDOW)).rejects.toThrow('ECONNREFUSED');
  });

  it('should delete the prefixed key when the attempts are cleared', async () => {
    const redis = fakeRedis();

    await new RedisLoginAttemptStore(redis).clear('abc');

    expect(redis.del).toHaveBeenCalledWith('auth:login-attempts:abc');
  });

  it('should close the connection without throwing when the module is destroyed', async () => {
    const redis = fakeRedis();
    redis.quit.mockRejectedValue(new Error('already closed'));

    await expect(new RedisLoginAttemptStore(redis).onModuleDestroy()).resolves.toBeUndefined();
  });
});

describe('createLoginAttemptStore', () => {
  it.each([{}, { REDIS_URL: '' }])('should use the in-process counter when REDIS_URL is %j', (env) => {
    expect(createLoginAttemptStore(env)).toBeInstanceOf(InMemoryLoginAttemptStore);
  });
});
