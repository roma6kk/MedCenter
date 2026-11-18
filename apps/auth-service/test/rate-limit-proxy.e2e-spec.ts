import type { INestApplication } from '@nestjs/common';
import { setRateLimitStore, type RateLimitStore } from '@medcenter/common';
import request from 'supertest';

import { startAuthApp } from './app-harness';
import { E2E_CLIENT_ID, applyE2eEnv } from './e2e-env';

jest.mock('jose', () => ({
  createRemoteJWKSet: () => 'mocked-jwks',
  jwtVerify: async () => ({ payload: {}, protectedHeader: { alg: 'RS256' } }),
}));

const TOKEN_LIMIT = 20;

class MemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, number>();

  async increment(key: string): Promise<number> {
    const bucket = key.replace(/:\d+$/, '');
    const next = (this.hits.get(bucket) ?? 0) + 1;
    this.hits.set(bucket, next);
    return next;
  }
}

async function bootApp(trustProxy: boolean | number): Promise<INestApplication> {
  return (await startAuthApp({ trustProxy })).app;
}

function tokenCall(app: INestApplication, forwardedFor: string): request.Test {
  return request(app.getHttpServer())
    .post('/oauth/token')
    .set('X-Forwarded-For', forwardedFor)
    .send({ grant_type: 'refresh_token', client_id: E2E_CLIENT_ID });
}

function refreshCall(app: INestApplication, forwardedFor: string, refreshToken: string): request.Test {
  return request(app.getHttpServer())
    .post('/oauth/token')
    .set('X-Forwarded-For', forwardedFor)
    .send({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: E2E_CLIENT_ID });
}

async function exhaust(app: INestApplication, forwardedFor: string): Promise<void> {
  for (let i = 0; i < TOKEN_LIMIT; i += 1) {
    const response = await tokenCall(app, forwardedFor);
    expect(response.status).not.toBe(429);
  }
}

describe('Rate limit behind a reverse proxy (X-Forwarded-For)', () => {
  beforeAll(() => {
    applyE2eEnv();
  });

  beforeEach(() => {
    setRateLimitStore(new MemoryRateLimitStore());
  });

  afterAll(() => {
    setRateLimitStore(null);
  });

  describe('when the proxy is trusted', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await bootApp(true);
    });

    afterAll(async () => {
      await app?.close();
    });

    it('should answer 429 with Retry-After once one forwarded client passes the limit', async () => {
      await exhaust(app, '203.0.113.10');

      const response = await tokenCall(app, '203.0.113.10');

      expect(response.status).toBe(429);
      expect(response.headers['retry-after']).toBe('60');
      expect(response.body).toMatchObject({ errorCode: 'RATE_LIMITED' });
    });

    it('should keep a different forwarded client on its own budget', async () => {
      await exhaust(app, '203.0.113.10');
      await tokenCall(app, '203.0.113.10').expect(429);

      const other = await tokenCall(app, '203.0.113.11');

      expect(other.status).not.toBe(429);
    });

    it('should not let one visitor drain the token budget of visitors behind the same address', async () => {
      for (let i = 0; i < TOKEN_LIMIT + 5; i += 1) {
        const response = await refreshCall(app, '10.0.0.9', `garbage-${i}`);
        expect(response.status).not.toBe(429);
      }

      const other = await refreshCall(app, '10.0.0.9', 'another-visitor-token');

      expect(other.status).not.toBe(429);
    });

    it('should answer 429 for one replayed refresh token whatever the address', async () => {
      for (let i = 0; i < TOKEN_LIMIT; i += 1) {
        await refreshCall(app, `203.0.113.${i + 1}`, 'replayed-token');
      }

      const response = await refreshCall(app, '203.0.113.200', 'replayed-token');

      expect(response.status).toBe(429);
    });

    it('should bucket on the client address, not the proxy hop appended to the chain', async () => {
      await exhaust(app, '203.0.113.10, 10.0.0.2');

      const response = await tokenCall(app, '203.0.113.10, 10.0.0.3');

      expect(response.status).toBe(429);
    });
  });

  describe('when the proxy is not trusted', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await bootApp(false);
    });

    afterAll(async () => {
      await app?.close();
    });

    it('should ignore X-Forwarded-For so a caller cannot mint fresh buckets by spoofing it', async () => {
      await exhaust(app, '203.0.113.10');

      const spoofed = await tokenCall(app, '198.51.100.99');

      expect(spoofed.status).toBe(429);
    });
  });
});
