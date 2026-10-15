import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createValidationPipe, setRateLimitStore, type RateLimitStore } from '@medcenter/common';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';
import request from 'supertest';

import { AppModule } from '../src/app/app.module';
import { DEDUP_STORE } from '../src/modules/notifications/deduplication.service';
import { applyE2eEnv } from './e2e-env';
import { bearer } from './e2e-tokens';

jest.mock('jose', () => jest.requireActual<typeof import('./e2e-tokens')>('./e2e-tokens').decodeOnlyJose());

const LIMIT = 3;
const UNREAD_COUNT = '/api/v1/notifications/unread-count';
const PATIENT_SCOPE = 'patient/*.read patient/*.write launch';

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

/**
 * NFR-006: 120 requests per minute per user and service. `main.ts` installs the
 * Redis-backed store (see `main.spec.ts`); these cases run the guard stack with
 * an in-memory one and prove the budget is per user.
 */
describe('Notification rate limit (e2e)', () => {
  const userA = bearer({ role: 'PATIENT', scope: PATIENT_SCOPE, patient: 'pat-1' });
  const userB = bearer({ role: 'PATIENT', scope: PATIENT_SCOPE, patient: 'pat-2' });
  let app: INestApplication;

  beforeAll(async () => {
    applyE2eEnv();
    process.env['RATE_LIMIT_PER_MINUTE'] = String(LIMIT);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FHIR_CLIENT)
      .useValue({ search: jest.fn().mockResolvedValue({ total: 0 }) } as unknown as FhirClient)
      .overrideProvider(DEDUP_STORE)
      .useValue({ claim: jest.fn(), complete: jest.fn(), delete: jest.fn() })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  beforeEach(() => {
    setRateLimitStore(new MemoryRateLimitStore());
  });

  afterAll(async () => {
    setRateLimitStore(null);
    await app?.close();
  });

  async function exhaust(token: string): Promise<void> {
    for (let call = 0; call < LIMIT; call += 1) {
      await request(app.getHttpServer()).get(UNREAD_COUNT).set('Authorization', token).expect(200);
    }
  }

  it('should answer 429 RATE_LIMITED with Retry-After when one user passes the budget', async () => {
    // Arrange
    await exhaust(userA);

    // Act
    const response = await request(app.getHttpServer()).get(UNREAD_COUNT).set('Authorization', userA);

    // Assert
    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('60');
    expect(response.body).toMatchObject({ status: 429, errorCode: 'RATE_LIMITED' });
  });

  it('should keep another user on their own budget when a busy user is limited', async () => {
    // Arrange
    await exhaust(userA);
    await request(app.getHttpServer()).get(UNREAD_COUNT).set('Authorization', userA).expect(429);

    // Act
    const other = await request(app.getHttpServer()).get(UNREAD_COUNT).set('Authorization', userB);

    // Assert
    expect(other.status).toBe(200);
  });

  it('should not count a refused call against the budget when the token lacks the scope', async () => {
    // Arrange
    const staff = bearer({ role: 'DOCTOR', scope: 'user/*.read launch', fhirUser: 'PractitionerRole/role-7' });
    for (let call = 0; call < LIMIT + 2; call += 1) {
      await request(app.getHttpServer()).get(UNREAD_COUNT).set('Authorization', staff).expect(403);
    }

    // Act
    const response = await request(app.getHttpServer()).get(UNREAD_COUNT).set('Authorization', staff);

    // Assert — scope and role run before the limiter, so the answer stays 403 and never turns 429.
    expect(response.status).toBe(403);
  });

  it('should never limit when no store is installed, which is why main.ts must install one', async () => {
    // Arrange
    setRateLimitStore(null);

    // Act / Assert
    for (let call = 0; call < LIMIT + 3; call += 1) {
      await request(app.getHttpServer()).get(UNREAD_COUNT).set('Authorization', userA).expect(200);
    }
  });
});
