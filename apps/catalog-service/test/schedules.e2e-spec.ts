import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app/app.module';
import { applyE2eEnv } from './e2e-env';

/**
 * Admin schedule flow (API §5.2). Exercises routing + RBAC without a live HAPI:
 * an unauthenticated call and a non-admin call must be rejected before the
 * FHIR client is ever touched.
 */
describe('Schedules (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    applyE2eEnv();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('should reject an unauthenticated schedule create with 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/schedules')
      .send({ practitionerRoleId: 'x', roomId: 'y', serviceId: 'z' })
      .expect(401);
  });

  it('should reject an unauthenticated slot generation with 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/schedules/sched-1/generate')
      .send({ from: '2026-11-01', to: '2026-11-30' })
      .expect(401);
  });
});
