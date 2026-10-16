import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createValidationPipe } from '@medcenter/common';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';
import request from 'supertest';

import { AppModule } from '../src/app/app.module';
import { InMemoryCacheStore } from '../src/modules/cache/__tests__/in-memory-cache-store';
import { CACHE_STORE } from '../src/modules/cache/redis-cache.service';
import { applyE2eEnv } from './e2e-env';
import { startTestIssuer, type TestIssuer } from './test-issuer';

const OWN_SCHEDULE = '/api/v1/doctor/schedule';
const ADMIN_DELETE = '/api/v1/admin/services/svc-1';
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
      .overrideProvider(CACHE_STORE)
      .useValue(new InMemoryCacheStore())
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
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ errorCode: 'UNAUTHENTICATED' });
    expect(response.headers['content-type']).toContain('application/problem+json');
    for (const interaction of [fhir.search, fhir.read, fhir.create, fhir.update, fhir.delete]) {
      expect(interaction).not.toHaveBeenCalled();
    }
  }

  it('should reach the handler when the token is signed by the trusted issuer and carries the doctor identity', async () => {
    // Act
    await request(app.getHttpServer()).get(OWN_SCHEDULE).set('Authorization', `Bearer ${issuer.sign(DOCTOR)}`).expect(200);

    // Assert
    expect(fhir.search).toHaveBeenCalledTimes(1);
  });

  it('should refuse the call before HAPI when the token is signed by a key the issuer does not publish', async () => {
    // Act
    const response = await request(app.getHttpServer()).get(OWN_SCHEDULE).set('Authorization', `Bearer ${other.sign(DOCTOR)}`);

    // Assert
    expectRefusedBeforeFhir(response);
  });

  it('should refuse the call before HAPI when the token has expired', async () => {
    // Act
    const response = await request(app.getHttpServer())
      .get(OWN_SCHEDULE)
      .set('Authorization', `Bearer ${issuer.sign(DOCTOR, { expiresInSeconds: -60 })}`);

    // Assert
    expectRefusedBeforeFhir(response);
  });

  it('should refuse the call before HAPI when the token names another issuer', async () => {
    // Act
    const response = await request(app.getHttpServer())
      .get(OWN_SCHEDULE)
      .set('Authorization', `Bearer ${issuer.sign(DOCTOR, { issuer: 'https://evil.example' })}`);

    // Assert
    expectRefusedBeforeFhir(response);
  });

  it('should refuse the admin service delete before HAPI when a doctor token is edited to claim the ADMIN role', async () => {
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
