import { BadRequestException, ConflictException, Logger } from '@nestjs/common';

import { fingerprintOf, IdempotencyService, type IdempotencyStore } from './idempotency.service';

const KEY = '6f1c2b8e-3d4a-4e5f-9a7b-1c2d3e4f5a6b';
const BODY = { slotId: '1b2c3d4e-0000-4000-8000-000000000001' };
const OTHER_BODY = { slotId: '1b2c3d4e-0000-4000-8000-000000000002' };

describe('IdempotencyService', () => {
  let values: Map<string, string>;
  let service: IdempotencyService;

  beforeEach(() => {
    values = new Map();
    const store: IdempotencyStore = {
      get: async (key) => values.get(key) ?? null,
      set: async (key, value) => {
        values.set(key, value);
      },
    };
    service = new IdempotencyService(store);
  });

  it('should run the operation once and replay its cached result when the same key is reused', async () => {
    const operation = jest.fn().mockResolvedValue({ id: 'apt-1' });

    const first = await service.run('user-1', KEY, BODY, operation);
    const replay = await service.run('user-1', KEY, BODY, operation);

    expect(first).toEqual({ id: 'apt-1' });
    expect(replay).toEqual({ id: 'apt-1' });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should not replay the response when another user sends the same key', async () => {
    const operation = jest.fn().mockResolvedValueOnce({ id: 'apt-1' }).mockResolvedValueOnce({ id: 'apt-2' });

    await service.run('user-1', KEY, BODY, operation);
    const other = await service.run('user-2', KEY, BODY, operation);

    expect(other).toEqual({ id: 'apt-2' });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should not cache the attempt when the operation fails, so the client can retry', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error('SLOT_CONFLICT'))
      .mockResolvedValueOnce({ id: 'apt-1' });

    await expect(service.run('user-1', KEY, BODY, operation)).rejects.toThrow('SLOT_CONFLICT');
    await expect(service.run('user-1', KEY, BODY, operation)).resolves.toEqual({ id: 'apt-1' });
  });

  it('should run without replay protection when no key is supplied', async () => {
    const operation = jest.fn().mockResolvedValue({ id: 'apt-1' });

    await service.run('user-1', undefined, BODY, operation);
    await service.run('user-1', undefined, BODY, operation);

    expect(operation).toHaveBeenCalledTimes(2);
    expect(values.size).toBe(0);
  });

  it('should reject with VALIDATION_ERROR when the key is not a UUID', async () => {
    await expect(service.run('user-1', 'not-a-uuid', BODY, jest.fn())).rejects.toBeInstanceOf(BadRequestException);
  });
  it('should refuse with CONFLICT instead of replaying when a reused key carries a different body', async () => {
    const operation = jest.fn().mockResolvedValue({ id: 'apt-1' });

    await service.run('user-1', KEY, BODY, operation);

    await expect(service.run('user-1', KEY, OTHER_BODY, operation)).rejects.toBeInstanceOf(ConflictException);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should treat the request as the same when only the JSON key order differs', async () => {
    const operation = jest.fn().mockResolvedValue({ id: 'apt-1' });

    await service.run('user-1', KEY, { slotId: 'a', serviceId: 'b' }, operation);
    const replay = await service.run('user-1', KEY, { serviceId: 'b', slotId: 'a' }, operation);

    expect(replay).toEqual({ id: 'apt-1' });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should fingerprint the body the same when an optional field is absent or undefined', () => {
    expect(fingerprintOf({ slotId: 'a', reason: undefined })).toBe(fingerprintOf({ slotId: 'a' }));
    expect(fingerprintOf({ slotId: 'a', reason: 'x' })).not.toBe(fingerprintOf({ slotId: 'a' }));
  });

  describe('when the store is down', () => {
    let failing: jest.Mocked<IdempotencyStore>;

    beforeEach(() => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      failing = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockRejectedValue(new Error('redis down')) };
      service = new IdempotencyService(failing);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should still return the result of an operation that succeeded when the store refuses the write', async () => {
      const operation = jest.fn().mockResolvedValue({ id: 'apt-1' });

      await expect(service.run('user-1', KEY, BODY, operation)).resolves.toEqual({ id: 'apt-1' });

      expect(operation).toHaveBeenCalledTimes(1);
      expect(Logger.prototype.warn).toHaveBeenCalledWith(expect.objectContaining({ scope: 'user-1', err: 'redis down' }), expect.any(String));
    });

    it('should fail the request before the operation runs when the store cannot be read', async () => {
      failing.get.mockRejectedValue(new Error('redis down'));
      const operation = jest.fn();

      await expect(service.run('user-1', KEY, BODY, operation)).rejects.toThrow('redis down');

      expect(operation).not.toHaveBeenCalled();
    });
  });
});

function lockingStore(values: Map<string, string>): jest.Mocked<Required<IdempotencyStore>> {
  return {
    get: jest.fn(async (key: string) => values.get(key) ?? null),
    set: jest.fn<Promise<void>, [string, string, number]>(async (key, value) => {
      values.set(key, value);
    }),
    setIfAbsent: jest.fn<Promise<boolean>, [string, string, number]>(async (key, value) => {
      if (values.has(key)) {
        return false;
      }
      values.set(key, value);
      return true;
    }),
    delete: jest.fn(async (key: string) => {
      values.delete(key);
    }),
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function errorPayloadOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return (error as { getResponse(): unknown }).getResponse();
  }
  throw new Error('expected the promise to reject');
}

describe('IdempotencyService in-flight guard', () => {
  const LOCK_KEY = `idempotency:user-1:${KEY}:lock`;
  let values: Map<string, string>;
  let store: jest.Mocked<Required<IdempotencyStore>>;
  let service: IdempotencyService;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    values = new Map();
    store = lockingStore(values);
    service = new IdempotencyService(store);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should run the operation once, refuse the concurrent retry with CONFLICT and replay the answer afterwards', async () => {
    const gate = deferred<{ id: string }>();
    const operation = jest.fn(() => gate.promise);

    const first = service.run('user-1', KEY, BODY, operation);
    const retry = service.run('user-1', KEY, BODY, operation);

    expect(await errorPayloadOf(retry)).toMatchObject({ errorCode: 'CONFLICT', message: expect.stringContaining('still being processed') });
    gate.resolve({ id: 'apt-1' });
    await expect(first).resolves.toEqual({ id: 'apt-1' });
    await expect(service.run('user-1', KEY, BODY, operation)).resolves.toEqual({ id: 'apt-1' });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(values.has(LOCK_KEY)).toBe(false);
  });

  it('should free the key when the operation fails, so that the retry runs the operation again', async () => {
    const operation = jest.fn().mockRejectedValueOnce(new Error('slot conflict')).mockResolvedValueOnce({ id: 'apt-1' });

    await expect(service.run('user-1', KEY, BODY, operation)).rejects.toThrow('slot conflict');
    expect(values.has(LOCK_KEY)).toBe(false);
    await expect(service.run('user-1', KEY, BODY, operation)).resolves.toEqual({ id: 'apt-1' });

    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should replay the answer of the request ahead when it finished between the first read and the claim', async () => {
    store.get.mockResolvedValueOnce(null).mockResolvedValueOnce(JSON.stringify({ fingerprint: fingerprintOf(BODY), response: { id: 'apt-1' } }));
    const operation = jest.fn();

    await expect(service.run('user-1', KEY, BODY, operation)).resolves.toEqual({ id: 'apt-1' });

    expect(operation).not.toHaveBeenCalled();
    expect(store.delete).toHaveBeenCalledWith(LOCK_KEY);
  });

  it('should run the operation without protection when the store cannot take the in-flight mark', async () => {
    store.setIfAbsent.mockRejectedValue(new Error('redis down'));
    const operation = jest.fn().mockResolvedValue({ id: 'apt-1' });

    await expect(service.run('user-1', KEY, BODY, operation)).resolves.toEqual({ id: 'apt-1' });

    expect(operation).toHaveBeenCalledTimes(1);
    expect(store.delete).not.toHaveBeenCalled();
    expect(Logger.prototype.warn).toHaveBeenCalledWith(expect.objectContaining({ scope: 'user-1', err: 'redis down' }), expect.any(String));
  });

  it('should still return the result when the store refuses to release the mark', async () => {
    store.delete.mockRejectedValue(new Error('redis down'));
    const operation = jest.fn().mockResolvedValue({ id: 'apt-1' });

    await expect(service.run('user-1', KEY, BODY, operation)).resolves.toEqual({ id: 'apt-1' });

    expect(Logger.prototype.warn).toHaveBeenCalledWith(expect.objectContaining({ err: 'redis down' }), expect.stringContaining('expires'));
  });
});
