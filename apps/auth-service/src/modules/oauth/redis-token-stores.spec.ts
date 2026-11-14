import { RedisTokenDenylist, RedisTokenStore, createTokenStores, type RedisTokenClient } from './redis-token-stores';
import { InMemoryTokenDenylist, InMemoryTokenStore, type StoredToken } from './token.service';

function fakeRedis(): RedisTokenClient & { readonly data: Map<string, { value: string; ttl: number }> } {
  const data = new Map<string, { value: string; ttl: number }>();
  return {
    data,
    set: async (key: string, value: string, mode: string, seconds: number | string) => {
      if (mode === 'KEEPTTL') {
        const existing = data.get(key);
        if (existing === undefined) return null;
        data.set(key, { value, ttl: existing.ttl });
        return 'OK';
      }
      data.set(key, { value, ttl: Number(seconds) });
      return 'OK';
    },
    get: async (key) => data.get(key)?.value ?? null,
    getdel: async (key) => {
      const value = data.get(key)?.value ?? null;
      data.delete(key);
      return value;
    },
    del: async (...keys) => keys.filter((key) => data.delete(key)).length,
    exists: async (...keys) => keys.filter((key) => data.has(key)).length,
    quit: async () => 'OK',
  };
}

const TOKEN: StoredToken = {
  jti: 'jti-1',
  userId: 'u1',
  clientId: 'medcenter-web',
  kind: 'refresh',
  scope: 'launch',
  codeChallenge: '',
  expiresAt: new Date(Date.now() + 60_000),
  role: 'PATIENT',
};

describe('RedisTokenStore', () => {
  it('should round-trip a token with its expiry as a Date', async () => {
    const store = new RedisTokenStore(fakeRedis());

    await store.save(TOKEN);

    await expect(store.find('jti-1')).resolves.toEqual(TOKEN);
  });

  it('should update the activity time in place and never resurrect a taken token', async () => {
    const redis = fakeRedis();
    const store = new RedisTokenStore(redis);
    await store.save(TOKEN);
    const ttl = redis.data.get('oauth:token:jti-1')?.ttl;

    await store.touch('jti-1', 42);

    await expect(store.find('jti-1')).resolves.toMatchObject({ lastActivityAt: 42 });
    expect(redis.data.get('oauth:token:jti-1')?.ttl).toBe(ttl);
    await store.take('jti-1');
    await store.touch('jti-1', 99);
    await expect(store.find('jti-1')).resolves.toBeNull();
  });

  it('should give the token to one taker only', async () => {
    const store = new RedisTokenStore(fakeRedis());
    await store.save(TOKEN);

    const [first, second] = await Promise.all([store.take('jti-1'), store.take('jti-1')]);

    expect([first, second].filter((token) => token !== null)).toHaveLength(1);
    await expect(store.find('jti-1')).resolves.toBeNull();
  });

  it('should expire the key with the token and never pass a non-positive ttl', async () => {
    const redis = fakeRedis();
    const store = new RedisTokenStore(redis);

    await store.save({ ...TOKEN, expiresAt: new Date(Date.now() - 5_000) });

    expect(redis.data.get('oauth:token:jti-1')?.ttl).toBe(1);
  });

  it('should delete a token', async () => {
    const store = new RedisTokenStore(fakeRedis());
    await store.save(TOKEN);

    await store.delete('jti-1');

    await expect(store.find('jti-1')).resolves.toBeNull();
  });
});

describe('RedisTokenDenylist', () => {
  it('should write under the prefix the BFF revocation checkers read', async () => {
    const redis = fakeRedis();
    const denylist = new RedisTokenDenylist(redis);

    await denylist.add('session:sid-1', 0);

    expect(redis.data.get('oauth:deny:session:sid-1')?.ttl).toBe(1);
    await expect(denylist.has('session:sid-1')).resolves.toBe(true);
    await expect(denylist.has('session:other')).resolves.toBe(false);
  });
});

describe('createTokenStores', () => {
  it('should use in-process maps without REDIS_URL', () => {
    const stores = createTokenStores({});

    expect(stores.store).toBeInstanceOf(InMemoryTokenStore);
    expect(stores.denylist).toBeInstanceOf(InMemoryTokenDenylist);
  });
});

describe('RedisTokenStore session index', () => {
  it('should resolve the live token of a session after the token rotated', async () => {
    const redis = fakeRedis();
    const store = new RedisTokenStore(redis);
    await store.save({ ...TOKEN, jti: 'jti-1', sessionId: 'sess-1' });
    await store.take('jti-1');
    await store.save({ ...TOKEN, jti: 'jti-2', sessionId: 'sess-1' });

    await expect(store.findCurrent('sess-1')).resolves.toMatchObject({ jti: 'jti-2' });
    expect(redis.data.get('oauth:session-current:sess-1')?.ttl).toBe(redis.data.get('oauth:token:jti-2')?.ttl);
  });

  it('should answer null for a session whose live token is gone', async () => {
    const store = new RedisTokenStore(fakeRedis());
    await store.save({ ...TOKEN, sessionId: 'sess-1' });
    await store.delete('jti-1');

    await expect(store.findCurrent('sess-1')).resolves.toBeNull();
    await expect(store.findCurrent('unknown')).resolves.toBeNull();
  });
});
