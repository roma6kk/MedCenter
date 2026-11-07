import { Controller, Get, INestApplication } from '@nestjs/common';
import request from 'supertest';

import { startAuthApp } from './app-harness';

@Controller()
class PerimeterProbeController {
  @Get('internal/perimeter-probe')
  probe(): string {
    return 'must never be reachable without a JWT';
  }
}

describe('JWT perimeter (distributed guard stack, ADR-009)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = (await startAuthApp({ controllers: [PerimeterProbeController] })).app;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('should expose the public service metadata without a token', async () => {
    await request(app.getHttpServer()).get('/').expect(200);
  });

  it('should answer an unauthenticated request with 401 problem+json UNAUTHENTICATED', async () => {
    const response = await request(app.getHttpServer())
      .get('/internal/perimeter-probe')
      .expect(401);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({ status: 401, errorCode: 'UNAUTHENTICATED' });
    expect(response.body.requestId).toBeDefined();
  });
});
