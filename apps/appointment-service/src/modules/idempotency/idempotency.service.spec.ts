import { BadRequestException, ConflictException } from '@nestjs/common';

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
});
