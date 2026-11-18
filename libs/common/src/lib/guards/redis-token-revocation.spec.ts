import { RedisTokenRevocationChecker, createDefaultRevocationChecker } from './redis-token-revocation';

describe('RedisTokenRevocationChecker', () => {
  it('should look up the session namespace under the shared prefix', async () => {
    const exists = jest.fn().mockResolvedValue(1);

    const revoked = await new RedisTokenRevocationChecker({ exists }).isRevoked('sid-1');

    expect(revoked).toBe(true);
    expect(exists).toHaveBeenCalledWith('oauth:deny:session:sid-1');
  });

  it('should report an unknown key as not revoked', async () => {
    const exists = jest.fn().mockResolvedValue(0);

    await expect(new RedisTokenRevocationChecker({ exists }).isRevoked('sid-2')).resolves.toBe(false);
  });

  it('should let a Redis error reach the guard, which fails open', async () => {
    const exists = jest.fn().mockRejectedValue(new Error('down'));

    await expect(new RedisTokenRevocationChecker({ exists }).isRevoked('sid-3')).rejects.toThrow('down');
  });
});

describe('createDefaultRevocationChecker', () => {
  it('should return null without REDIS_URL', () => {
    expect(createDefaultRevocationChecker({})).toBeNull();
    expect(createDefaultRevocationChecker({ REDIS_URL: '' })).toBeNull();
  });
});
