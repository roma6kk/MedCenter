import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { cookiesOf, startAuthApp } from './app-harness';
import { PATIENT_PASSWORD, openLoginForm, submitLogin, type LoginForm } from './auth-flow-helpers';
import { expectProblem } from './problem-assertions';

jest.mock(
  'jose',
  () => jest.requireActual<typeof import('./synthetic-token')>('./synthetic-token').joseStub,
);

const EMAIL = 'login-validation@example.by';

/** `POST /oauth/login` (assumption UI-1): the form's field bounds, and what a half-filled form gets back. */
const hasSessionCookie = (response: request.Response): boolean =>
  cookiesOf(response.headers['set-cookie']).some((cookie) => cookie.startsWith('mc_as_session='));

describe('POST /oauth/login — form validation', () => {
  let app: INestApplication;
  let form: LoginForm;

  const rawPost = (fields: Record<string, string | ReadonlyArray<string>>): request.Test =>
    request(app.getHttpServer())
      .post('/oauth/login')
      .set('Cookie', form.csrfCookie)
      .type('form')
      .send({ csrf: form.csrfField, authorize_query: form.authorizeQuery, ...fields })
      .redirects(0);

  beforeAll(async () => {
    app = (await startAuthApp()).app;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: EMAIL,
        firstName: 'Иван',
        lastName: 'Иванов',
        password: PATIENT_PASSWORD,
        birthDate: '1990-05-12',
      })
      .expect(201);
  });

  beforeEach(async () => {
    form = await openLoginForm(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([
    [
      'an email over 255 characters',
      { email: `${'a'.repeat(250)}@example.by`, password: PATIENT_PASSWORD },
    ],
    ['a password over 128 characters', { email: EMAIL, password: 'P'.repeat(129) }],
    [
      'a csrf token over 128 characters',
      { email: EMAIL, password: PATIENT_PASSWORD, csrf: 'c'.repeat(129) },
    ],
    [
      'an authorize_query over 8192 characters',
      { email: EMAIL, password: PATIENT_PASSWORD, authorize_query: 'q'.repeat(8193) },
    ],
    [
      'the email repeated as a list',
      { email: [EMAIL, 'other@example.by'], password: PATIENT_PASSWORD },
    ],
    [
      'the password repeated as a list',
      { email: EMAIL, password: [PATIENT_PASSWORD, PATIENT_PASSWORD] },
    ],
  ])(
    'should answer 400 VALIDATION_ERROR and issue no session when the form carries %s',
    async (_label, fields) => {
      const response = await rawPost(fields);

      expectProblem(response, 400, 'VALIDATION_ERROR');
      expect(hasSessionCookie(response)).toBe(false);
    },
  );

  it.each([
    ['both fields are missing', {}],
    ['the email is missing', { password: PATIENT_PASSWORD }],
    ['the password is missing', { email: EMAIL }],
    ['both fields are empty', { email: '', password: '' }],
  ])(
    'should re-render the form with the generic message and issue no session when %s',
    async (_label, fields) => {
      const response = await rawPost(fields).expect(200);

      expect(response.text).toContain('role="alert"');
      expect(hasSessionCookie(response)).toBe(false);
    },
  );

  it('should answer exactly like a wrong password when the typed email has odd letter case and spaces around it', async () => {
    const wrong = await submitLogin(app, form, { email: EMAIL, password: 'Wr0ng!Password' }).expect(
      200,
    );
    const spaced = await submitLogin(app, form, {
      email: `  ${EMAIL.toUpperCase()}  `,
      password: 'Wr0ng!Password',
    }).expect(200);

    expect(spaced.text).toContain('role="alert"');
    expect(spaced.status).toBe(wrong.status);
  });

  it('should answer 404 problem+json when the login route is called with GET', async () => {
    const response = await request(app.getHttpServer()).get('/oauth/login');

    expectProblem(response, 404, 'NOT_FOUND');
  });
});
