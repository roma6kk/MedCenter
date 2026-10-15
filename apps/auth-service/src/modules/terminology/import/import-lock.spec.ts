import { IMPORT_LOCK_KEY, InMemoryImportLock, RedisImportLock, createImportLock, type RedisLockClient } from './import-lock';

describe('InMemoryImportLock', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should refuse a second lease when the first one is still held', async () => {
    const lock = new InMemoryImportLock();
    await lock.acquire(60);

    expect(await lock.acquire(60)).toBeNull();
  });

  it('should grant a new lease when the previous one was released', async () => {
    const lock = new InMemoryImportLock();
    const lease = await lock.acquire(60);
    await lease?.release();

    expect(await lock.acquire(60)).not.toBeNull();
  });

  it('should grant a new lease when the held one has expired', async () => {
    const lock = new InMemoryImportLock();
    await lock.acquire(60);
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);

    expect(await lock.acquire(60)).not.toBeNull();
  });

  it('should keep the newer lease when an expired holder releases late', async () => {
    const lock = new InMemoryImportLock();
    const stale = await lock.acquire(60);
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);
    await lock.acquire(60);

    await stale?.release();

    expect(await lock.acquire(60)).toBeNull();
  });
});

describe('RedisImportLock', () => {
  function fakeRedis(overrides: Partial<RedisLockClient> = {}): jest.Mocked<RedisLockClient> {
    return {
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockResolvedValue(1),
      quit: jest.fn().mockResolvedValue('OK'),
      ...overrides,
    } as jest.Mocked<RedisLockClient>;
  }

  it('should take the key with NX and an expiry when the lock is free', async () => {
    const redis = fakeRedis();

    const lease = await new RedisImportLock(redis).acquire(1800);

    expect(lease).not.toBeNull();
    expect(redis.set).toHaveBeenCalledWith(IMPORT_LOCK_KEY, expect.any(String), 'EX', 1800, 'NX');
  });

  it('should answer null when another holder owns the key', async () => {
    const redis = fakeRedis({ set: jest.fn().mockResolvedValue(null) });

    expect(await new RedisImportLock(redis).acquire(1800)).toBeNull();
  });

  it('should propagate the failure when Redis cannot prove the lock is free', async () => {
    const redis = fakeRedis({ set: jest.fn().mockRejectedValue(new Error('down')) });

    await expect(new RedisImportLock(redis).acquire(1800)).rejects.toThrow('down');
  });

  it('should release only the key it owns when the lease is released', async () => {
    const redis = fakeRedis();
    const lease = await new RedisImportLock(redis).acquire(1800);
    const token = redis.set.mock.calls[0]?.[1];

    await lease?.release();

    expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('del'"), 1, IMPORT_LOCK_KEY, token);
  });

  it('should not throw when the release fails because Redis went away', async () => {
    const redis = fakeRedis({ eval: jest.fn().mockRejectedValue(new Error('down')) });
    const lease = await new RedisImportLock(redis).acquire(1800);

    await expect(lease?.release()).resolves.toBeUndefined();
  });

  it('should close the connection when the module is destroyed', async () => {
    const redis = fakeRedis();

    await new RedisImportLock(redis).onModuleDestroy();

    expect(redis.quit).toHaveBeenCalledTimes(1);
  });

  describe('when the module is destroyed during an import', () => {
    it('should release the lease it still holds before it closes the connection', async () => {
      const redis = fakeRedis();
      const lock = new RedisImportLock(redis);
      await lock.acquire(1800);
      const token = redis.set.mock.calls[0]?.[1];

      await lock.onModuleDestroy();

      expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('del'"), 1, IMPORT_LOCK_KEY, token);
      expect(redis.eval.mock.invocationCallOrder[0]).toBeLessThan(redis.quit.mock.invocationCallOrder[0] ?? 0);
    });

    it('should not release a lease twice when the import already released it', async () => {
      const redis = fakeRedis();
      const lock = new RedisImportLock(redis);
      const lease = await lock.acquire(1800);
      await lease?.release();

      await lock.onModuleDestroy();

      expect(redis.eval).toHaveBeenCalledTimes(1);
    });

    it('should still close the connection when releasing the held lease fails', async () => {
      const redis = fakeRedis({ eval: jest.fn().mockRejectedValue(new Error('down')) });
      const lock = new RedisImportLock(redis);
      await lock.acquire(1800);

      await expect(lock.onModuleDestroy()).resolves.toBeUndefined();

      expect(redis.quit).toHaveBeenCalledTimes(1);
    });
  });
});

describe('createImportLock', () => {
  it('should fall back to the in-process lock when no Redis is configured', () => {
    expect(createImportLock({})).toBeInstanceOf(InMemoryImportLock);
    expect(createImportLock({ REDIS_URL: '' })).toBeInstanceOf(InMemoryImportLock);
  });
});
