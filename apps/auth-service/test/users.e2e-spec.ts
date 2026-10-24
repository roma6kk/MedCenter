import type { INestApplication } from '@nestjs/common';
import { Role } from '@medcenter/contracts';
import request from 'supertest';

import { createdOf, outboxEvent, outboxRecords } from '../src/modules/users/__tests__/users-harness';
import { ADMIN, startWithAdmin, type AdminFixture } from './admin-fixture';
import { PATIENT_PASSWORD, bearer, claimsOfToken, signIn } from './auth-flow-helpers';

// `jose` is pure ESM and Jest's CJS runtime cannot load it; the signature check is stubbed and the
// claims are decoded from the token the application actually signed (see `oauth.e2e-spec.ts`).
jest.mock('jose', () => ({
  createRemoteJWKSet: () => 'mocked-jwks',
  jwtVerify: async (token: string) => {
    const segment = token.split('.')[1] ?? '';
    const payload: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    return { payload, protectedHeader: { alg: 'RS256' } };
  },
}));

const DOCTOR_PASSWORD = 'D0ctor!Passw0rd';

function registration(email: string): Record<string, unknown> {
  return { email, firstName: 'Иван', lastName: 'Иванов', password: PATIENT_PASSWORD, birthDate: '1990-05-12', accountConsent: { accepted: true, textVersion: '2026-10' } };
}

/** API §2.2.6/2.2.7 — registration, `/me` and the admin perimeter, over real HTTP and the real guard stack. */
describe('Users API (API 2.2.6, 2.2.7 and the admin perimeter)', () => {
  let fixture: AdminFixture;
  let app: INestApplication;

  const api = (): ReturnType<typeof request> => request(app.getHttpServer());
  const asAdmin = (test: request.Test): request.Test => test.set('authorization', fixture.adminAuthorization);

  beforeAll(async () => {
    fixture = await startWithAdmin();
    app = fixture.app;
  });

  afterAll(async () => {
    await fixture?.close();
  });

  describe('bootstrap administrator', () => {
    it('should let the bootstrapped ADMIN sign in with user scopes and no FHIR link', async () => {
      const claims = claimsOfToken(fixture.admin);

      expect(claims).toMatchObject({ role: Role.ADMIN, scope: 'launch user/*.read user/*.write' });
      expect(claims['fhirUser']).toBeUndefined();
      expect(claims['patient']).toBeUndefined();
    });
  });

  describe('POST /api/v1/auth/register', () => {
    it('should create the account and its FHIR Patient without any credentials', async () => {
      const response = await api().post('/api/v1/auth/register').send(registration('new@example.by')).expect(201);

      expect(response.body).toMatchObject({
        email: 'new@example.by',
        roles: [Role.PATIENT],
        isActive: true,
        patientRef: expect.stringMatching(/^Patient\//),
      });
      expect(response.body).not.toHaveProperty('passwordHash');
      expect(createdOf(fixture.started.fakes.fhir, 'Patient').at(-1)).toMatchObject({ birthDate: '1990-05-12' });
    });

    it('should mark the registration answer Cache-Control no-store because it carries personal data', async () => {
      const response = await api().post('/api/v1/auth/register').send(registration('nostore@example.by')).expect(201);

      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('should record patient.registered.v1 in the outbox and write an AuditEvent when the account is created', async () => {
      await api().post('/api/v1/auth/register').send(registration('events@example.by')).expect(201);

      const [record] = outboxRecords(fixture.started.fakes.fhir);
      expect(outboxEvent(record?.resource ?? {})).toMatchObject({ type: 'patient.registered.v1' });
      expect(JSON.stringify(record?.resource)).not.toContain('events@example.by');
      expect(createdOf(fixture.started.fakes.fhir, 'AuditEvent').at(-1)).toMatchObject({ resourceType: 'AuditEvent', action: 'C' });
    });

    it('should answer 409 with EMAIL_TAKEN in the detail when the email exists in another letter case', async () => {
      await api().post('/api/v1/auth/register').send(registration('dup@example.by')).expect(201);

      const response = await api().post('/api/v1/auth/register').send(registration('DUP@example.by')).expect(409);

      expect(response.body).toMatchObject({ status: 409, errorCode: 'CONFLICT' });
      expect(response.body.detail).toContain('EMAIL_TAKEN');
    });

    it('should answer 400 VALIDATION_ERROR when the password is weak', async () => {
      const response = await api()
        .post('/api/v1/auth/register')
        .send({ ...registration('weak@example.by'), password: 'password' })
        .expect(400);

      expect(response.body).toMatchObject({ status: 400, errorCode: 'VALIDATION_ERROR' });
    });

    it('should answer 400 VALIDATION_ERROR when the birth date is not a calendar date', async () => {
      await api().post('/api/v1/auth/register').send({ ...registration('date@example.by'), birthDate: '1990-02-31' }).expect(400);
    });

    it('should ignore a roles field so a self-registration can never become an administrator', async () => {
      const response = await api()
        .post('/api/v1/auth/register')
        .send({ ...registration('sneaky@example.by'), roles: ['ADMIN'], isActive: false })
        .expect(201);

      expect(response.body).toMatchObject({ roles: [Role.PATIENT], isActive: true });
    });

    it('should remove the account again when HAPI rejects the Patient so the email can be retried', async () => {
      fixture.started.fakes.fhir.create.mockRejectedValueOnce(new Error('HAPI down'));
      const failed = await api().post('/api/v1/auth/register').send(registration('retry@example.by'));

      const retried = await api().post('/api/v1/auth/register').send(registration('retry@example.by'));

      expect(failed.status).toBe(500);
      expect(failed.body).toMatchObject({ errorCode: 'INTERNAL' });
      expect(retried.status).toBe(201);
    });
  });

  describe('GET /api/v1/me', () => {
    it('should answer 401 when no Bearer token is presented', async () => {
      await api().get('/api/v1/me').expect(401);
    });

    it('should return the caller, never another account, for any Bearer role', async () => {
      const me = await asAdmin(api().get('/api/v1/me')).expect(200);

      expect(me.body).toMatchObject({ email: ADMIN.email, role: Role.ADMIN, externalLinks: [] });
    });
  });

  describe('admin perimeter', () => {
    it('should answer 401 when the admin list is requested without a token', async () => {
      await api().get('/api/v1/admin/users').expect(401);
    });

    it('should answer 403 FORBIDDEN_SCOPE when a patient calls the admin list', async () => {
      await api().post('/api/v1/auth/register').send(registration('plain@example.by')).expect(201);
      const patient = await signIn(app, { email: 'plain@example.by', password: PATIENT_PASSWORD });

      const response = await api().get('/api/v1/admin/users').set('authorization', bearer(patient)).expect(403);

      expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_SCOPE' });
    });

    it('should answer 403 FORBIDDEN_ROLE when a doctor, who holds the user scopes, calls the admin list', async () => {
      await asAdmin(api().post('/api/v1/admin/users'))
        .send({ email: 'staff@medcenter.by', firstName: 'Пётр', lastName: 'Петров', password: DOCTOR_PASSWORD, roles: [Role.DOCTOR] })
        .expect(201);
      const doctor = await signIn(app, { email: 'staff@medcenter.by', password: DOCTOR_PASSWORD });

      const response = await api().get('/api/v1/admin/users').set('authorization', bearer(doctor)).expect(403);

      expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_ROLE' });
    });
  });
});
