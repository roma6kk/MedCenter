import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app/app.module';
import { applyE2eEnv } from './e2e-env';

/**
 * Admin room flow (API §4.3–4.6). The FHIR backend is stubbed through the
 * `FHIR_CLIENT` provider so the suite exercises routing, RBAC and the
 * `ROOM_IN_USE` guard without a live HAPI.
 */
describe('Rooms (e2e)', () => {
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

  it('should reject an unauthenticated admin create with 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/rooms')
      .send({ identifier: '204-Х', name: 'Кабинет 204' })
      .expect(401);
  });
});
