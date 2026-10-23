import type { INestApplication } from '@nestjs/common';
import { Role } from '@medcenter/contracts';
import request from 'supertest';

import { createdOf } from '../src/modules/users/__tests__/users-harness';
import { startAuthApp, type AuthApp } from './app-harness';
import { expectProblem } from './problem-assertions';
import { REGISTRATION } from './users-helpers';

jest.mock(
  'jose',
  () => jest.requireActual<typeof import('./synthetic-token')>('./synthetic-token').joseStub,
);

const VALID = { ...REGISTRATION, email: 'register-validation@example.by' };

/** API §2.2.6 `POST /api/v1/auth/register`: the public endpoint refuses bad input before it writes anything. */
describe('POST /api/v1/auth/register — validation and response contract', () => {
  let started: AuthApp;
  let app: INestApplication;

  const register = (body: unknown): request.Test =>
    request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(body as object);
  const effects = (): readonly number[] => [
    started.fakes.store.users.size,
    createdOf(started.fakes.fhir, 'Patient').length,
    createdOf(started.fakes.fhir, 'AuditEvent').length,
    started.fakes.publisher.publish.mock.calls.length,
  ];

  beforeAll(async () => {
    started = await startAuthApp();
    app = started.app;
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([
    ['the email is missing', { email: undefined }],
    ['the email is malformed', { email: 'ivanov@' }],
    ['the first name is empty', { firstName: '' }],
    ['the last name is over 100 characters', { lastName: 'Я'.repeat(101) }],
    ['the password is missing', { password: undefined }],
    ['the password has no symbol', { password: 'Passw0rdOnly' }],
    ['the password is over 128 characters', { password: `Aa1!${'x'.repeat(125)}` }],
    ['the account consent is missing', { accountConsent: undefined }],
    ['the account consent was not accepted', { accountConsent: { accepted: false, textVersion: '2026-10' } }],
    ['the birth date is missing', { birthDate: undefined }],
    ['the birth date carries a time', { birthDate: '1990-05-12T10:00:00Z' }],
    ['the birth date is not a calendar day', { birthDate: '1990-02-31' }],
    ['the gender is JSON null', { gender: null }],
    ['the gender is outside the supported set', { gender: 'robot' }],
    ['the phone is JSON null', { phone: null }],
    ['the phone is not a Belarus number', { phone: '+7 912 345 67 89' }],
  ])(
    'should answer 400 VALIDATION_ERROR and write nothing anywhere when %s',
    async (_label, overrides) => {
      const before = effects();

      const response = await register({ ...VALID, ...overrides });

      expectProblem(response, 400, 'VALIDATION_ERROR');
      expect(effects()).toEqual(before);
    },
  );

  it('should answer 400 VALIDATION_ERROR when the request carries no body', async () => {
    expectProblem(
      await request(app.getHttpServer()).post('/api/v1/auth/register'),
      400,
      'VALIDATION_ERROR',
    );
  });

  it('should answer 400 VALIDATION_ERROR when the body is not parseable JSON', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('content-type', 'application/json')
      .send('{"email": ');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });

  it('should answer 201 with exactly the account fields of the contract and nothing secret when the body is valid', async () => {
    const response = await register(VALID).expect(201);

    expect(Object.keys(response.body).sort()).toEqual(
      [
        'email',
        'firstName',
        'id',
        'isActive',
        'lastName',
        'name',
        'patientRef',
        'practitionerRoleRef',
        'role',
        'roles',
      ].sort(),
    );
    expect(response.body).toMatchObject({
      email: VALID.email,
      firstName: 'Анна',
      lastName: 'Орлова',
      roles: [Role.PATIENT],
      role: Role.PATIENT,
      isActive: true,
      practitionerRoleRef: null,
    });
  });

  it('should store the email lower-cased when it arrives in mixed case', async () => {
    const response = await register({ ...VALID, email: 'Mixed.Case@Example.BY' }).expect(201);

    expect(response.body.email).toBe('mixed.case@example.by');
  });

  it('should answer 400 VALIDATION_ERROR when the email has spaces around it because the form must send it trimmed', async () => {
    expectProblem(
      await register({ ...VALID, email: '  padded@example.by ' }),
      400,
      'VALIDATION_ERROR',
    );
  });

  it('should answer 409 and add no second Patient when the same registration is sent twice', async () => {
    const body = { ...VALID, email: 'twice@example.by' };
    await register(body).expect(201);
    const before = effects();

    const response = await register(body);

    expectProblem(response, 409, 'CONFLICT');
    expect(effects()).toEqual(before);
  });
});
