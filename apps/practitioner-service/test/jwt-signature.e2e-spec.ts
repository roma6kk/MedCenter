import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createValidationPipe } from '@medcenter/common';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';
import request from 'supertest';

import { AppModule } from '../src/app/app.module';
import { applyE2eEnv } from './e2e-env';
import { startTestIssuer, type TestIssuer } from '@medcenter/testing';

const ROOMS = '/api/v1/rooms';
const ADMIN_DELETE = '/api/v1/admin/rooms/room-204';
const DOCTOR = { role: 'DOCTOR', scope: 'user/*.read launch', fhirUser: 'PractitionerRole/role-7' } as const;

function withPayload(token: string, claims: Record<string, unknown>): string {
  const [header, payload, signature] = token.split('.');
  const original = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as Record<string, unknown>;
  const tampered = Buffer.from(JSON.stringify({ ...original, ...claims })).toString('base64url');
  return `${header}.${tampered}.${signature}`;
}

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
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ errorCode: 'UNAUTHENTICATED' });
    expect(response.headers['content-type']).toContain('application/problem+json');
    for (const interaction of [fhir.search, fhir.read, fhir.create, fhir.update, fhir.delete]) {
      expect(interaction).not.toHaveBeenCalled();
    }
  }

  it('should reach the handler when the token is signed by the trusted issuer and carries user/*.read', async () => {
    await request(app.getHttpServer()).get(ROOMS).set('Authorization', `Bearer ${issuer.sign(DOCTOR)}`).expect(200);

    expect(fhir.search).toHaveBeenCalledTimes(1);
  });

  it('should refuse the call before HAPI when the token is signed by a key the issuer does not publish', async () => {
    const response = await request(app.getHttpServer()).get(ROOMS).set('Authorization', `Bearer ${other.sign(DOCTOR)}`);

    expectRefusedBeforeFhir(response);
  });

  it('should refuse the call before HAPI when the token has expired', async () => {
    const response = await request(app.getHttpServer())
      .get(ROOMS)
      .set('Authorization', `Bearer ${issuer.sign(DOCTOR, { expiresInSeconds: -60 })}`);

    expectRefusedBeforeFhir(response);
  });

  it('should refuse the call before HAPI when the token names another issuer', async () => {
    const response = await request(app.getHttpServer())
      .get(ROOMS)
      .set('Authorization', `Bearer ${issuer.sign(DOCTOR, { issuer: 'https://evil.example' })}`);

    expectRefusedBeforeFhir(response);
  });

  it('should refuse the admin delete before HAPI when a doctor token is edited to claim the ADMIN role', async () => {
    const escalated = withPayload(issuer.sign(DOCTOR), { role: 'ADMIN' });

    const response = await request(app.getHttpServer()).delete(ADMIN_DELETE).set('Authorization', `Bearer ${escalated}`);

    expectRefusedBeforeFhir(response);
  });

  it('should refuse the call before HAPI when the token is unsigned (alg none)', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ ...DOCTOR, sub: 'u1', jti: 'j1', iss: 'https://api.medcenter.by', exp: 4102444800 })).toString('base64url');

    const response = await request(app.getHttpServer()).delete(ADMIN_DELETE).set('Authorization', `Bearer ${header}.${payload}.`);

    expectRefusedBeforeFhir(response);
  });
});
