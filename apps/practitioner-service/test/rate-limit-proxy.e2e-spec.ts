import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp, setRateLimitStore, type RateLimitStore, type TrustProxySetting } from '@medcenter/common';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';
import request from 'supertest';

import { AppModule } from '../src/app/app.module';
import { applyE2eEnv } from './e2e-env';

const LIMIT = 5;
const DOCTORS_URL = '/api/v1/doctors';

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
  const fhir = { search: jest.fn().mockResolvedValue({ entry: [] }) } as unknown as FhirClient;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FHIR_CLIENT)
    .useValue(fhir)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, trustProxy);
  await app.init();
  return app;
}

function doctorsCall(app: INestApplication, forwardedFor: string): request.Test {
  return request(app.getHttpServer()).get(DOCTORS_URL).set('X-Forwarded-For', forwardedFor);
}

async function exhaust(app: INestApplication, forwardedFor: string): Promise<void> {
  for (let i = 0; i < LIMIT; i += 1) {
    const response = await doctorsCall(app, forwardedFor);
    expect(response.status).toBe(200);
  }
}

describe('Public doctor catalog rate limit (e2e)', () => {
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
      await exhaust(app, '203.0.113.10');

      const response = await doctorsCall(app, '203.0.113.10');

      expect(response.status).toBe(429);
      expect(response.headers['retry-after']).toBe('60');
      expect(response.body).toMatchObject({ errorCode: 'RATE_LIMITED' });
    });

    it('should not advertise the framework when a request is answered', async () => {
      const response = await doctorsCall(app, '203.0.113.12');

      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('should keep another patient on their own budget when a busy client is limited', async () => {
      await exhaust(app, '203.0.113.10');
      await doctorsCall(app, '203.0.113.10').expect(429);

      const other = await doctorsCall(app, '203.0.113.11');

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
      await exhaust(app, '203.0.113.10');

      const other = await doctorsCall(app, '198.51.100.99');

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
      setRateLimitStore(null);

      for (let i = 0; i < LIMIT + 3; i += 1) {
        const response = await doctorsCall(app, '203.0.113.10');
        expect(response.status).toBe(200);
      }
    });
  });
});
