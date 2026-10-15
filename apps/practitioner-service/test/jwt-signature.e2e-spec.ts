import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createValidationPipe } from '@medcenter/common';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';
import request from 'supertest';

import { AppModule } from '../src/app/app.module';
import { applyE2eEnv } from './e2e-env';
import { startTestIssuer, type TestIssuer } from './test-issuer';

const ROOMS = '/api/v1/rooms';
const ADMIN_DELETE = '/api/v1/admin/rooms/room-204';
const DOCTOR = { role: 'DOCTOR', scope: 'user/*.read launch', fhirUser: 'PractitionerRole/role-7' } as const;

/** Re-signs nothing: swaps the payload of a valid token and keeps the original signature. */
function withPayload(token: string, claims: Record<string, unknown>): string {
  const [header, payload, signature] = token.split('.');
  const original = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as Record<string, unknown>;
  const tampered = Buffer.from(JSON.stringify({ ...original, ...claims })).toString('base64url');
  return `${header}.${tampered}.${signature}`;
}

/**
 * The perimeter with real RS256 verification (ADR-009): the guard stack checks
 * every token against the issuer's JWKS, exactly as in the stack. A refused call
 * must never reach HAPI.
 *
 * Refusals are asserted as "an error problem+json, nothing written" rather than
 * 401: `libs/common` `JwtAuthGuard` still lets `jose` errors escape as 500
 * (see tasks/TASK-001/test-generator-platform-report.md). Tighten to 401 once it maps them.
 */
describe('JWT signature verification (e2e)', () => {
  let issuer: TestIssuer;
  let other: TestIssuer;
  let app: INestApplication;
  let fhir: jest.Mocked<FhirClient>;

  beforeAll(async () => {
    issuer = await startTestIssuer();
    other = await startTestIssuer();
    applyE2eEnv();
    process.env['JWT_JWKS_URI'] = issuer.jwksUri;
    fhir = {
      search: jest.fn().mockResolvedValue({ entry: [] }),
      read: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<FhirClient>;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FHIR_CLIENT)
      .useValue(fhir)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await issuer?.close();
    await other?.close();
  });

  beforeEach(() => {
    for (const interaction of Object.values(fhir)) {
      (interaction as jest.Mock).mockClear();
    }
  });

  function expectRefusedBeforeFhir(response: request.Response): void {
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    for (const interaction of [fhir.search, fhir.read, fhir.create, fhir.update, fhir.delete]) {
      expect(interaction).not.toHaveBeenCalled();
    }
  }

  it('should reach the handler when the token is signed by the trusted issuer and carries user/*.read', async () => {
    // Act
    await request(app.getHttpServer()).get(ROOMS).set('Authorization', `Bearer ${issuer.sign(DOCTOR)}`).expect(200);

    // Assert
    expect(fhir.search).toHaveBeenCalledTimes(1);
  });

  it('should refuse the call before HAPI when the token is signed by a key the issuer does not publish', async () => {
    // Act
    const response = await request(app.getHttpServer()).get(ROOMS).set('Authorization', `Bearer ${other.sign(DOCTOR)}`);

    // Assert
    expectRefusedBeforeFhir(response);
  });

  it('should refuse the call before HAPI when the token has expired', async () => {
    // Act
    const response = await request(app.getHttpServer())
      .get(ROOMS)
      .set('Authorization', `Bearer ${issuer.sign(DOCTOR, { expiresInSeconds: -60 })}`);

    // Assert
    expectRefusedBeforeFhir(response);
  });

  it('should refuse the call before HAPI when the token names another issuer', async () => {
    // Act
    const response = await request(app.getHttpServer())
      .get(ROOMS)
      .set('Authorization', `Bearer ${issuer.sign(DOCTOR, { issuer: 'https://evil.example' })}`);

    // Assert
    expectRefusedBeforeFhir(response);
  });

  it('should refuse the admin delete before HAPI when a doctor token is edited to claim the ADMIN role', async () => {
    // Arrange
    const escalated = withPayload(issuer.sign(DOCTOR), { role: 'ADMIN' });

    // Act
    const response = await request(app.getHttpServer()).delete(ADMIN_DELETE).set('Authorization', `Bearer ${escalated}`);

    // Assert
    expectRefusedBeforeFhir(response);
  });

  it('should refuse the call before HAPI when the token is unsigned (alg none)', async () => {
    // Arrange
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ ...DOCTOR, sub: 'u1', jti: 'j1', iss: 'https://api.medcenter.by', exp: 4102444800 })).toString('base64url');

    // Act
    const response = await request(app.getHttpServer()).delete(ADMIN_DELETE).set('Authorization', `Bearer ${header}.${payload}.`);

    // Assert
    expectRefusedBeforeFhir(response);
  });
});
