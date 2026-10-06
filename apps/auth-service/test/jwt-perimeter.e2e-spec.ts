import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app/app.module';
import { applyE2eEnv } from './e2e-env';

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
    // `AppModule` mounts the OAuth surface, whose signing keys are an eager provider
    // factory, so the app cannot be instantiated without this environment.
    applyE2eEnv();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [PerimeterProbeController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
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
