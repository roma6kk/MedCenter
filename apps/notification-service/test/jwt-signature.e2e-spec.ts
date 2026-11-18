import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createValidationPipe } from '@medcenter/common';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';
import request from 'supertest';

import { AppModule } from '../src/app/app.module';
import { DEDUP_STORE } from '../src/modules/notifications/deduplication.service';
import { applyE2eEnv } from './e2e-env';
import { startTestIssuer, type TestIssuer } from '@medcenter/testing';

const NOTIFICATIONS = '/api/v1/notifications';
const PATIENT = { role: 'PATIENT', scope: 'patient/*.read patient/*.write launch', patient: 'pat-1', fhirUser: 'Patient/pat-1' } as const;

function withPayload(token: string, claims: Record<string, unknown>): string {
  const [header, payload, signature] = token.split('.');
  const original = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as Record<string, unknown>;
  const tampered = Buffer.from(JSON.stringify({ ...original, ...claims })).toString('base64url');
  return `${header}.${tampered}.${signature}`;
}

/** A refused call must never reach HAPI, least of all with another patient's compartment. */
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
    fhir = { search: jest.fn().mockResolvedValue({ entry: [] }), read: jest.fn(), update: jest.fn() } as unknown as jest.Mocked<FhirClient>;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FHIR_CLIENT)
      .useValue(fhir)
      .overrideProvider(DEDUP_STORE)
      .useValue({ claim: jest.fn(), complete: jest.fn(), delete: jest.fn() })
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
    for (const interaction of [fhir.search, fhir.read, fhir.update]) {
      interaction.mockClear();
    }
  });

  function expectRefusedBeforeFhir(response: request.Response): void {
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ errorCode: 'UNAUTHENTICATED' });
    expect(response.headers['content-type']).toContain('application/problem+json');
    for (const interaction of [fhir.search, fhir.read, fhir.update]) {
      expect(interaction).not.toHaveBeenCalled();
    }
  }

  it('should list the own notifications when the token is signed by the trusted issuer', async () => {
    await request(app.getHttpServer()).get(NOTIFICATIONS).set('Authorization', `Bearer ${issuer.sign(PATIENT)}`).expect(200);

    expect(fhir.search).toHaveBeenCalledWith('Communication', expect.objectContaining({ recipient: 'Patient/pat-1' }));
  });

  it('should refuse the call before HAPI when the token is signed by a key the issuer does not publish', async () => {
    const response = await request(app.getHttpServer()).get(NOTIFICATIONS).set('Authorization', `Bearer ${other.sign(PATIENT)}`);

    expectRefusedBeforeFhir(response);
  });

  it('should refuse the call before HAPI when the token has expired', async () => {
    const response = await request(app.getHttpServer())
      .get(NOTIFICATIONS)
      .set('Authorization', `Bearer ${issuer.sign(PATIENT, { expiresInSeconds: -60 })}`);

    expectRefusedBeforeFhir(response);
  });

  it('should refuse the call before HAPI when the token names another issuer', async () => {
    const response = await request(app.getHttpServer())
      .get(NOTIFICATIONS)
      .set('Authorization', `Bearer ${issuer.sign(PATIENT, { issuer: 'https://evil.example' })}`);

    expectRefusedBeforeFhir(response);
  });

  it('should never search another patient compartment when a token is edited to name a different patient', async () => {
    const edited = withPayload(issuer.sign(PATIENT), { patient: 'pat-2', fhirUser: 'Patient/pat-2' });

    const response = await request(app.getHttpServer()).get(NOTIFICATIONS).set('Authorization', `Bearer ${edited}`);

    expectRefusedBeforeFhir(response);
  });

  it('should refuse the call before HAPI when the token is unsigned (alg none)', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ ...PATIENT, sub: 'u1', jti: 'j1', iss: 'https://api.medcenter.by', exp: 4102444800 })).toString('base64url');

    const response = await request(app.getHttpServer()).get(NOTIFICATIONS).set('Authorization', `Bearer ${header}.${payload}.`);

    expectRefusedBeforeFhir(response);
  });
});
