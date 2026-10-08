import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  createValidationPipe,
  setRateLimitStore,
  type RateLimitStore,
} from '@medcenter/common';
import request from 'supertest';

import { AppModule } from '../src/app/app.module';
import { E2E_CLIENT_ID, applyE2eEnv } from './e2e-env';

// Same stub as `oauth.e2e-spec.ts`: `jose` is pure ESM and Jest's CJS runtime cannot load it.
jest.mock('jose', () => ({
  createRemoteJWKSet: () => 'mocked-jwks',
  jwtVerify: async () => ({ payload: {}, protectedHeader: { alg: 'RS256' } }),
}));

/** `@RateLimit(20)` on `POST /oauth/token`. */
const TOKEN_LIMIT = 20;

/**
 * In-memory store. The trailing `:<minute>` segment is dropped from the key so a
 * suite that straddles a minute boundary cannot split one bucket in two.
 */
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
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(createValidationPipe());
  // Express reads `X-Forwarded-For` only when `trust proxy` is set; this is the
  // knob a Traefik-fronted deployment turns on.
  app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);
  await app.init();
  return app;
}

/** An unknown refresh token: cheap, side-effect free, answered 400 below the limit. */
function tokenCall(app: INestApplication, forwardedFor: string): request.Test {
  return request(app.getHttpServer())
    .post('/oauth/token')
    .set('X-Forwarded-For', forwardedFor)
    .send({ grant_type: 'refresh_token', refresh_token: 'nope', client_id: E2E_CLIENT_ID });
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

    it('should bucket on the client address, not the proxy hop appended to the chain', async () => {
      // `true` trusts every hop, so the left-most entry is the client.
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
