import type { INestApplication } from '@nestjs/common';
import { Role } from '@medcenter/contracts';
import request from 'supertest';

import { startWithAdmin, type AdminFixture } from './admin-fixture';
import {
  PATIENT_PASSWORD,
  bearer,
  claimsOfToken,
  signIn,
  type TokenBody,
} from './auth-flow-helpers';
import { syntheticBearer } from './synthetic-token';

jest.mock(
  'jose',
  () => jest.requireActual<typeof import('./synthetic-token')>('./synthetic-token').joseStub,
);

const DOCTOR = { email: 'me-doctor@medcenter.by', password: 'D0ctor!Passw0rd' } as const;
const ALICE = { email: 'alice@example.by', password: PATIENT_PASSWORD } as const;
const BORIS = { email: 'boris@example.by', password: PATIENT_PASSWORD } as const;

interface Account {
  readonly id: string;
  readonly patientRef: string | null;
  readonly token: TokenBody;
}

/** API §2.2.7 and ADR-013 — the caller's own profile; the patient compartment comes from the token only. */
describe('GET /api/v1/me and the patient compartment', () => {
  let fixture: AdminFixture;
  let app: INestApplication;
  let alice: Account;
  let boris: Account;
  let doctor: TokenBody;

  const api = (): ReturnType<typeof request> => request(app.getHttpServer());

  async function register(
    who: { readonly email: string; readonly password: string },
    firstName: string,
  ): Promise<Account> {
    const created = await api()
      .post('/api/v1/auth/register')
      .send({ ...who, firstName, lastName: 'Тестов', birthDate: '1990-05-12' })
      .expect(201);
    return {
      id: created.body.id,
      patientRef: created.body.patientRef,
      token: await signIn(app, who),
    };
  }

  beforeAll(async () => {
    fixture = await startWithAdmin();
    app = fixture.app;
    alice = await register(ALICE, 'Алиса');
    boris = await register(BORIS, 'Борис');
    await api()
      .post('/api/v1/admin/users')
      .set('authorization', fixture.adminAuthorization)
      .send({
        ...DOCTOR,
        firstName: 'Пётр',
        lastName: 'Петров',
        roles: [Role.DOCTOR],
        practitionerRoleId: 'role-me',
      })
      .expect(201);
    doctor = await signIn(app, DOCTOR);
  });

  afterAll(async () => {
    await fixture?.close();
  });

  describe('for each role', () => {
    it('should return the patient account with its Patient link when a PATIENT calls it', async () => {
      const response = await api()
        .get('/api/v1/me')
        .set('authorization', bearer(alice.token))
        .expect(200);

      expect(response.body).toMatchObject({
        id: alice.id,
        email: ALICE.email,
        firstName: 'Алиса',
        roles: [Role.PATIENT],
        role: Role.PATIENT,
        isActive: true,
        patientRef: alice.patientRef,
        practitionerRoleRef: null,
        externalLinks: [{ resourceType: 'Patient', reference: alice.patientRef }],
      });
      expect(response.body.createdAt).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
    });

    it('should return the doctor account with its PractitionerRole link when a DOCTOR calls it', async () => {
      const response = await api()
        .get('/api/v1/me')
        .set('authorization', bearer(doctor))
        .expect(200);

      expect(response.body).toMatchObject({
        roles: [Role.DOCTOR],
        patientRef: null,
        practitionerRoleRef: 'PractitionerRole/role-me',
        externalLinks: [{ resourceType: 'PractitionerRole', resourceId: 'role-me' }],
      });
    });

    it('should return the administrator without any FHIR link when an ADMIN calls it', async () => {
      const response = await api()
        .get('/api/v1/me')
        .set('authorization', fixture.adminAuthorization)
        .expect(200);

      expect(response.body).toMatchObject({
        roles: [Role.ADMIN],
        patientRef: null,
        practitionerRoleRef: null,
        externalLinks: [],
      });
    });

    it('should never expose the password hash when the profile is returned', async () => {
      const response = await api()
        .get('/api/v1/me')
        .set('authorization', bearer(alice.token))
        .expect(200);

      expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|password_hash|scrypt\$/);
    });

    it('should mark the profile Cache-Control no-store because it carries personal data', async () => {
      const response = await api()
        .get('/api/v1/me')
        .set('authorization', bearer(alice.token))
        .expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
    });
  });

  describe('token claims and the profile agree', () => {
    it('should carry the bare Patient id and Patient/{id} fhirUser the profile links when a patient signs in', () => {
      const claims = claimsOfToken(alice.token);

      expect(claims['patient']).toBe(alice.patientRef?.replace('Patient/', ''));
      expect(claims['fhirUser']).toBe(alice.patientRef);
    });

    it('should carry PractitionerRole/{id} as fhirUser and no patient claim when a doctor signs in', () => {
      const claims = claimsOfToken(doctor);

      expect(claims['fhirUser']).toBe('PractitionerRole/role-me');
      expect(claims['patient']).toBeUndefined();
    });
  });

  describe('compartment (ADR-013): the caller comes from the token, never from a parameter', () => {
    it.each([
      [
        'patient (bare id)',
        (b: Account): string => `patient=${b.patientRef?.replace('Patient/', '')}`,
      ],
      ['patient (reference)', (b: Account): string => `patient=${b.patientRef}`],
      ['id', (b: Account): string => `id=${b.id}`],
      ['userId', (b: Account): string => `userId=${b.id}`],
      ['sub', (b: Account): string => `sub=${b.id}`],
    ])(
      'should return the caller and ignore the %s query parameter naming another patient',
      async (_label, query) => {
        const response = await api()
          .get(`/api/v1/me?${query(boris)}`)
          .set('authorization', bearer(alice.token))
          .expect(200);

        expect(response.body).toMatchObject({
          id: alice.id,
          email: ALICE.email,
          patientRef: alice.patientRef,
        });
      },
    );

    it('should answer 404 when a patient addresses another account below /me because the route takes no id', async () => {
      await api()
        .get(`/api/v1/me/${boris.id}`)
        .set('authorization', bearer(alice.token))
        .expect(404);
    });

    it('should answer 403 FORBIDDEN_SCOPE when a patient reads another patient through the admin card', async () => {
      const response = await api()
        .get(`/api/v1/admin/users/${boris.id}`)
        .set('authorization', bearer(alice.token))
        .expect(403);

      expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_SCOPE' });
    });

    it('should answer 403 FORBIDDEN_ROLE when a doctor reads a patient through the admin card', async () => {
      const response = await api()
        .get(`/api/v1/admin/users/${boris.id}`)
        .set('authorization', bearer(doctor))
        .expect(403);

      expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_ROLE' });
    });

    it('should not let a patient deactivate another account when the id is guessed', async () => {
      await api()
        .delete(`/api/v1/admin/users/${boris.id}`)
        .set('authorization', bearer(alice.token))
        .expect(403);

      const stillActive = await api()
        .get('/api/v1/me')
        .set('authorization', bearer(boris.token))
        .expect(200);
      expect(stillActive.body.isActive).toBe(true);
    });
  });

  describe('error mapping', () => {
    it('should answer 404 NOT_FOUND as problem+json when the token subject has no account', async () => {
      const ghost = syntheticBearer({
        sub: '3f2c9a2e-8a0b-4f55-9d34-2f4a6f0b9b11',
        role: Role.PATIENT,
        scope: 'launch patient/*.read',
        patient: 'ghost',
      });

      const response = await api().get('/api/v1/me').set('authorization', ghost).expect(404);

      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({
        status: 404,
        errorCode: 'NOT_FOUND',
        instance: '/api/v1/me',
      });
    });

    it('should echo the X-Request-Id of the caller in the problem document when the request fails', async () => {
      const response = await api().get('/api/v1/me').set('x-request-id', 'trace-me-1').expect(401);

      expect(response.body).toMatchObject({
        requestId: 'trace-me-1',
        errorCode: 'UNAUTHENTICATED',
      });
    });
  });
});
