import { Controller, Get, INestApplication } from '@nestjs/common';
import request from 'supertest';

import { startAuthApp } from './app-harness';

/**
 * Spec-only probe controller: it never ships with the application, it exists to
 * prove that the globally mounted guard stack (ADR-009) protects any route that
 * is not explicitly marked `@Public()`.
 */
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
    // The harness declares the signing environment the eager OAuth providers
    // need and swaps PostgreSQL/HAPI for in-memory fakes.
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
