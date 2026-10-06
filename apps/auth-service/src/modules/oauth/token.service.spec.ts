import { ACCESS_TOKEN_TTL_SECONDS } from './jwt.service';
import {
  InMemoryTokenDenylist,
  InMemoryTokenStore,
  REFRESH_TOKEN_TTL_SECONDS,
  TokenService,
  type IssueTokenParams,
} from './token.service';

const BASE_PARAMS: IssueTokenParams = {
  userId: 'u1',
  clientId: 'medcenter-web',
  scope: 'launch patient/*.read',
  kind: 'code',
  ttlSeconds: 300,
  codeChallenge: 'challenge-value',
};

function createService(): {
  readonly service: TokenService;
  readonly store: InMemoryTokenStore;
  readonly denylist: InMemoryTokenDenylist;
} {
  const store = new InMemoryTokenStore();
  const denylist = new InMemoryTokenDenylist();

  return { service: new TokenService(store, denylist), store, denylist };
}

describe('InMemoryTokenDenylist', () => {
  it('should report a sealed jti as denied', async () => {
    const denylist = new InMemoryTokenDenylist();

    await denylist.add('jti-1', 60);

    await expect(denylist.has('jti-1')).resolves.toBe(true);
  });

  it('should report an unknown jti as not denied', async () => {
    const denylist = new InMemoryTokenDenylist();

    await expect(denylist.has('never-seen')).resolves.toBe(false);
  });

  it('should forget a jti once its ttl has elapsed', async () => {
    const denylist = new InMemoryTokenDenylist();
    await denylist.add('jti-1', 0);

    await expect(denylist.has('jti-1')).resolves.toBe(false);
  });
});

describe('TokenService', () => {
  describe('issue', () => {
    it('should store a token with a fresh jti when issue is called', async () => {
      const { service, store } = createService();

      const issued = await service.issue(BASE_PARAMS);

      expect(issued.jti).toMatch(/^[0-9a-f-]{36}$/);
      await expect(store.find(issued.jti)).resolves.toMatchObject({ userId: 'u1' });
    });

    it('should give every issued token a distinct jti', async () => {
      const { service } = createService();

      const first = await service.issue(BASE_PARAMS);
      const second = await service.issue(BASE_PARAMS);

      expect(first.jti).not.toBe(second.jti);
    });

    it('should set the expiry from the requested ttl', async () => {
      const { service } = createService();
      const before = Date.now();

      const issued = await service.issue({ ...BASE_PARAMS, ttlSeconds: 300 });

      const lifetimeMs = issued.expiresAt.getTime() - before;
      expect(lifetimeMs).toBeGreaterThan(299_000);
      expect(lifetimeMs).toBeLessThan(301_000);
    });

    it('should default the code challenge to an empty string for refresh tokens', async () => {
      const { service } = createService();

      const issued = await service.issue({
        userId: 'u1',
        clientId: 'medcenter-web',
        scope: 'launch',
        kind: 'refresh',
        ttlSeconds: REFRESH_TOKEN_TTL_SECONDS,
      });

      expect(issued.codeChallenge).toBe('');
    });

    it('should carry the RBAC and compartment claims onto the stored row', async () => {
      const { service } = createService();

      const issued = await service.issue({
        ...BASE_PARAMS,
        role: 'DOCTOR',
        patientRef: 'Patient/9f2c',
        fhirUser: 'PractitionerRole/42',
      });

      expect(issued).toMatchObject({
        role: 'DOCTOR',
        patientRef: 'Patient/9f2c',
        fhirUser: 'PractitionerRole/42',
      });
    });
  });

  describe('consume', () => {
    it('should return the token when the jti and kind match', async () => {
      const { service } = createService();
      const issued = await service.issue(BASE_PARAMS);

      await expect(service.consume(issued.jti, 'code')).resolves.toMatchObject({ jti: issued.jti });
    });

    it('should delete the row and seal the jti against reuse when it is consumed', async () => {
      const { service, store } = createService();
      const issued = await service.issue(BASE_PARAMS);

      await service.consume(issued.jti, 'code');

      await expect(store.find(issued.jti)).resolves.toBeNull();
      await expect(service.isDenied(issued.jti)).resolves.toBe(true);
    });

    it('should not end the session when a token is merely consumed', async () => {
      const { service } = createService();
      const issued = await service.issue({ ...BASE_PARAMS, kind: 'refresh' });

      await service.consume(issued.jti, 'refresh');

      // Rotation seals the refresh token against reuse but must leave the access
      // token the client is still using alone, or every rotation would log its
      // own caller out (the guard answers 401 TOKEN_REVOKED).
      await expect(service.isRevoked(issued.jti)).resolves.toBe(false);
    });

    it('should refuse a second consumption of the same jti', async () => {
      const { service } = createService();
      const issued = await service.issue(BASE_PARAMS);

      await service.consume(issued.jti, 'code');

      await expect(service.consume(issued.jti, 'code')).resolves.toBeNull();
    });

    it('should return null when the jti is unknown', async () => {
      const { service } = createService();

      await expect(service.consume('does-not-exist', 'code')).resolves.toBeNull();
    });

    it('should return null when the stored token has a different kind', async () => {
      const { service, store } = createService();
      const issued = await service.issue({ ...BASE_PARAMS, kind: 'refresh' });

      await expect(service.consume(issued.jti, 'code')).resolves.toBeNull();
      await expect(store.find(issued.jti)).resolves.toMatchObject({ kind: 'refresh' });
    });

    it('should return null and drop the row when the token has expired', async () => {
      const { service, store } = createService();
      const issued = await service.issue({ ...BASE_PARAMS, ttlSeconds: 0 });

      // The denylist entry is deliberately not asserted here: `consume` derives its
      // TTL from the *remaining* lifetime, which is <= 0 for an expired token, so the
      // seal is a no-op. The token is unusable either way, because consumption checks
      // `expiresAt` directly (see the `InMemoryTokenDenylist` ttl case above).
      await expect(service.consume(issued.jti, 'code')).resolves.toBeNull();
      await expect(store.find(issued.jti)).resolves.toBeNull();
    });
  });

  describe('isDenied', () => {
    it('should report a consumed jti as denied', async () => {
      const { service } = createService();
      const issued = await service.issue(BASE_PARAMS);
      await service.consume(issued.jti, 'code');

      await expect(service.isDenied(issued.jti)).resolves.toBe(true);
    });

    it('should report a live jti as not denied', async () => {
      const { service } = createService();
      const issued = await service.issue(BASE_PARAMS);

      await expect(service.isDenied(issued.jti)).resolves.toBe(false);
    });
  });

  describe('revoke', () => {
    it('should drop the stored row and seal the jti when a token is revoked', async () => {
      const { service, store } = createService();
      const issued = await service.issue({ ...BASE_PARAMS, kind: 'refresh' });

      await service.revoke(issued.jti);

      await expect(store.find(issued.jti)).resolves.toBeNull();
      await expect(service.isDenied(issued.jti)).resolves.toBe(true);
    });

    it('should mark the jti as a revoked session when a token is revoked', async () => {
      const { service } = createService();
      const issued = await service.issue({ ...BASE_PARAMS, kind: 'refresh' });

      await service.revoke(issued.jti);

      await expect(service.isRevoked(issued.jti)).resolves.toBe(true);
    });

    it('should prevent any further consumption after a revoke', async () => {
      const { service } = createService();
      const issued = await service.issue({ ...BASE_PARAMS, kind: 'refresh' });

      await service.revoke(issued.jti);

      await expect(service.consume(issued.jti, 'refresh')).resolves.toBeNull();
    });

    it('should seal the jti even when it was never stored', async () => {
      const { service } = createService();

      await service.revoke('never-issued');

      await expect(service.isDenied('never-issued')).resolves.toBe(true);
    });
  });

  describe('isRevoked', () => {
    it('should report a revoked session as revoked', async () => {
      const { service } = createService();
      const issued = await service.issue({ ...BASE_PARAMS, kind: 'refresh' });
      await service.revoke(issued.jti);

      await expect(service.isRevoked(issued.jti)).resolves.toBe(true);
    });

    it('should report a live session as not revoked', async () => {
      const { service } = createService();
      const issued = await service.issue({ ...BASE_PARAMS, kind: 'refresh' });

      await expect(service.isRevoked(issued.jti)).resolves.toBe(false);
    });

    it('should report an unknown session as not revoked', async () => {
      const { service } = createService();

      await expect(service.isRevoked('never-issued')).resolves.toBe(false);
    });

    it('should forget a revoked session after the access-token lifetime has elapsed', async () => {
      jest.useFakeTimers();
      try {
        const { service } = createService();
        const issued = await service.issue({ ...BASE_PARAMS, kind: 'refresh' });
        await service.revoke(issued.jti);

        jest.setSystemTime(Date.now() + (ACCESS_TOKEN_TTL_SECONDS + 1) * 1000);

        // The session seal only has to outlive the access tokens minted for it.
        // The reuse seal is bounded by the refresh token's own 14-day lifetime.
        await expect(service.isRevoked(issued.jti)).resolves.toBe(false);
        await expect(service.isDenied(issued.jti)).resolves.toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
