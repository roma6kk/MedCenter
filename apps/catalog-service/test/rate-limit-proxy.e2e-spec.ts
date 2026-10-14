import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { setRateLimitStore, type RateLimitStore } from '@medcenter/common';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';
import request from 'supertest';

import { AppModule } from '../src/app/app.module';
import { configureApp } from '../src/bootstrap';
import type { TrustProxySetting } from '../src/config/trust-proxy';
import { applyE2eEnv } from './e2e-env';

const LIMIT = 5;
const SLOTS_URL = '/api/v1/doctors/prac-1/slots';

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

async function bootApp(trustProxy: TrustProxySetting): Promise<INestApplication> {
  const fhir = {
    read: jest.fn().mockResolvedValue({ resourceType: 'Practitioner', id: 'prac-1' }),
    search: jest.fn().mockResolvedValue({ entry: [] }),
  } as unknown as FhirClient;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FHIR_CLIENT)
    .useValue(fhir)
    .compile();
  const app = moduleRef.createNestApplication();
  // The same pipeline `main.ts` ships: trust proxy and the validation pipe.
  configureApp(app, trustProxy);
  await app.init();
  return app;
}

function slotsCall(app: INestApplication, forwardedFor: string): request.Test {
  return request(app.getHttpServer()).get(SLOTS_URL).set('X-Forwarded-For', forwardedFor);
}

async function exhaust(app: INestApplication, forwardedFor: string): Promise<void> {
  for (let i = 0; i < LIMIT; i += 1) {
    const response = await slotsCall(app, forwardedFor);
    expect(response.status).toBe(200);
  }
}

/**
 * The public `GET /doctors/{id}/slots` has no token, so the rate-limit bucket
 * is `ip + path`. `main.ts` installs the store (`enableRateLimit`) and tells
 * Express to read the client from `X-Forwarded-For` (`TRUST_PROXY=1` behind
 * Traefik); these suites run the guard stack with the same two settings.
 */
describe('Public slots rate limit (e2e)', () => {
  beforeAll(() => {
    applyE2eEnv();
    process.env['RATE_LIMIT_PER_MINUTE'] = String(LIMIT);
  });

  beforeEach(() => {
    setRateLimitStore(new MemoryRateLimitStore());
  });

  afterAll(() => {
    setRateLimitStore(null);
  });

  describe('when the Traefik hop is trusted', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await bootApp(1);
    });

    afterAll(async () => {
      await app?.close();
    });

    it('should answer 429 RATE_LIMITED with Retry-After when one client passes the limit', async () => {
      // Arrange
      await exhaust(app, '203.0.113.10');

      // Act
      const response = await slotsCall(app, '203.0.113.10');

      // Assert
      expect(response.status).toBe(429);
      expect(response.headers['retry-after']).toBe('60');
      expect(response.body).toMatchObject({ errorCode: 'RATE_LIMITED' });
    });

    it('should keep another patient on their own budget when a busy client is limited', async () => {
      // Arrange
      await exhaust(app, '203.0.113.10');
      await slotsCall(app, '203.0.113.10').expect(429);

      // Act
      const other = await slotsCall(app, '203.0.113.11');

      // Assert
      expect(other.status).toBe(200);
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

    it('should put every caller in the proxy bucket when X-Forwarded-For is ignored', async () => {
      // Arrange — the failure `TRUST_PROXY` prevents: one busy client answers 429 to everybody.
      await exhaust(app, '203.0.113.10');

      // Act
      const other = await slotsCall(app, '198.51.100.99');

      // Assert
      expect(other.status).toBe(429);
    });
  });

  describe('when no rate-limit store is installed', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await bootApp(1);
    });

    afterAll(async () => {
      await app?.close();
    });

    it('should never limit when the store is missing, which is why main.ts must install one', async () => {
      // Arrange
      setRateLimitStore(null);

      // Act / Assert
      for (let i = 0; i < LIMIT + 3; i += 1) {
        const response = await slotsCall(app, '203.0.113.10');
        expect(response.status).toBe(200);
      }
    });
  });
});
