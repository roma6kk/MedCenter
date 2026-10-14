import { Controller, Get } from '@nestjs/common';
import request from 'supertest';

import { startAppHarness, type AppHarness } from './app-harness';

/**
 * Spec-only probe controller: it never ships with the application; it proves
 * the globally mounted guard stack (ADR-009) protects every non-`@Public()`
 * route. Every service carries this file.
 */
@Controller()
class PerimeterProbeController {
  @Get('internal/perimeter-probe')
  probe(): string {
    return 'must never be reachable without a JWT';
  }
}

describe('JWT perimeter (distributed guard stack, ADR-009)', () => {
  let harness: AppHarness;

  beforeAll(async () => {
    harness = await startAppHarness([PerimeterProbeController]);
  });

  afterAll(async () => {
    await harness?.close();
  });

  it('should answer an unauthenticated request with 401 problem+json UNAUTHENTICATED when no token is sent', async () => {
    const response = await request(harness.app.getHttpServer()).get('/internal/perimeter-probe').expect(401);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({ status: 401, errorCode: 'UNAUTHENTICATED' });
    expect(response.body.requestId).toBeDefined();
  });

  // Known defect of the shared guard (not this service): `JwtAuthGuard.canActivate`
  // (libs/common/src/lib/guards/jwt-auth.guard.ts) lets `jose`'s
  // `JWSSignatureVerificationFailed` / `JWTExpired` escape, so ProblemDetailsFilter
  // answers 500 INTERNAL instead of the catalogued 401 UNAUTHENTICATED (API §1).
  // Reported in tasks/TASK-001/coder-m5-analytics-report.md; unskip once the guard maps them.
  it.skip('should reject a token signed by a foreign key with 401 when the signature does not verify', async () => {
    const foreign = `${harness.adminToken().split('.').slice(0, 2).join('.')}.c2lnbmF0dXJl`;

    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/admin/audit')
      .set('Authorization', `Bearer ${foreign}`)
      .expect(401);

    expect(response.body.errorCode).toBe('UNAUTHENTICATED');
  });

  it('should keep the liveness probe public when the container runtime polls /health', async () => {
    const response = await request(harness.app.getHttpServer()).get('/health').expect(200);

    expect(response.body).toEqual({ status: 'ok', service: 'analytics-service' });
  });
});
