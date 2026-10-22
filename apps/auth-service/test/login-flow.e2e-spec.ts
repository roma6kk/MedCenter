import type { INestApplication } from '@nestjs/common';
import { Role } from '@medcenter/contracts';
import { setRateLimitStore, type RateLimitStore } from '@medcenter/common';
import request from 'supertest';

import {
  INVALID_CREDENTIALS_MESSAGE,
  STALE_FORM_MESSAGE,
  THROTTLED_MESSAGE,
} from '../src/modules/oauth/login/login.controller';
import { startAuthApp, cookiesOf, type AuthApp } from './app-harness';
import {
  PATIENT_PASSWORD,
  PKCE_VERIFIER,
  authorizeQuery,
  bearer,
  claimsOfToken,
  openLoginForm,
  signIn,
  submitLogin,
} from './auth-flow-helpers';
import { E2E_CLIENT_ID } from './e2e-env';

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

const REGISTRATION = {
  email: 'ivanov@example.by',
  firstName: 'Иван',
  lastName: 'Иванов',
  password: PATIENT_PASSWORD,
  birthDate: '1990-05-12',
  accountConsent: { accepted: true, textVersion: '2026-10' },
} as const;

class MemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, number>();

  async increment(key: string): Promise<number> {
    const bucket = key.replace(/:\d+$/, '');
    const next = (this.hits.get(bucket) ?? 0) + 1;
    this.hits.set(bucket, next);
    return next;
  }
}

/** The credential step of the browser PKCE flow (assumption UI-1), over real HTTP and the real guard stack. */
describe('Browser login flow (GET /oauth/authorize → POST /oauth/login → code → token)', () => {
  let started: AuthApp;
  let app: INestApplication;
  let patientId: string;

  beforeAll(async () => {
    started = await startAuthApp();
    app = started.app;
    const registered = await request(app.getHttpServer()).post('/api/v1/auth/register').send(REGISTRATION).expect(201);
    patientId = String(registered.body.patientRef).replace('Patient/', '');
  });

  afterAll(async () => {
    setRateLimitStore(null);
    await app?.close();
  });

  describe('when the credentials are valid', () => {
    it('should issue tokens whose patient and fhirUser claims come from the ExternalLink', async () => {
      const token = await signIn(app, { email: REGISTRATION.email, password: PATIENT_PASSWORD });

      expect(claimsOfToken(token)).toMatchObject({
        role: Role.PATIENT,
        patient: patientId,
        fhirUser: `Patient/${patientId}`,
      });
      expect(token.patient).toBe(patientId);
      expect(token.scope).toBe('launch patient/*.read patient/*.write');
    });

    it('should accept the email in another letter case', async () => {
      const token = await signIn(app, { email: ' Ivanov@Example.BY ', password: PATIENT_PASSWORD });

      expect(claimsOfToken(token)['patient']).toBe(patientId);
    });

    it('should keep patient and fhirUser on the refreshed token', async () => {
      const first = await signIn(app, { email: REGISTRATION.email, password: PATIENT_PASSWORD });

      const refreshed = await request(app.getHttpServer())
        .post('/oauth/token')
        .type('form')
        .send({ grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: E2E_CLIENT_ID })
        .expect(200);

      const claims = claimsOfToken(refreshed.body);
      expect(claims['patient']).toBe(patientId);
      expect(claims['fhirUser']).toBe(`Patient/${patientId}`);
    });

    it('should serve the profile with its ExternalLink to the signed-in user', async () => {
      const token = await signIn(app, { email: REGISTRATION.email, password: PATIENT_PASSWORD });

      const me = await request(app.getHttpServer()).get('/api/v1/me').set('authorization', bearer(token)).expect(200);

      expect(me.body).toMatchObject({
        email: REGISTRATION.email,
        patientRef: `Patient/${patientId}`,
        externalLinks: [{ resourceType: 'Patient', resourceId: patientId }],
      });
      expect(me.body).not.toHaveProperty('passwordHash');
    });

    it('should set an httpOnly SameSite=Lax session cookie scoped to /oauth', async () => {
      const form = await openLoginForm(app);

      const login = await submitLogin(app, form, { email: REGISTRATION.email, password: PATIENT_PASSWORD }).expect(302);

      const header = ([] as string[]).concat(login.headers['set-cookie'] ?? []).find((c) => c.startsWith('mc_as_session='));
      expect(header).toMatch(/HttpOnly/i);
      expect(header).toMatch(/SameSite=Lax/i);
      expect(header).toMatch(/Path=\/oauth/);
      expect(login.headers['location']).toBe(`/oauth/authorize?${form.authorizeQuery}`);
    });

    it('should carry the state of the original request back to the client redirect', async () => {
      const form = await openLoginForm(app, authorizeQuery('state-xyz'));
      const login = await submitLogin(app, form, { email: REGISTRATION.email, password: PATIENT_PASSWORD }).expect(302);

      const authorized = await request(app.getHttpServer())
        .get(String(login.headers['location']))
        .set('Cookie', cookiesOf(login.headers['set-cookie']).join('; '))
        .redirects(0)
        .expect(302);

      const redirect = new URL(String(authorized.headers['location']));
      expect(redirect.searchParams.get('state')).toBe('state-xyz');
      expect(redirect.searchParams.get('code')).toBeTruthy();
    });

    it('should not let the same login session mint a second code', async () => {
      const form = await openLoginForm(app);
      const login = await submitLogin(app, form, { email: REGISTRATION.email, password: PATIENT_PASSWORD }).expect(302);
      const cookie = cookiesOf(login.headers['set-cookie']).join('; ');
      const path = String(login.headers['location']);
      await request(app.getHttpServer()).get(path).set('Cookie', cookie).redirects(0).expect(302);

      const replay = await request(app.getHttpServer()).get(path).set('Cookie', cookie).redirects(0).expect(200);

      expect(replay.text).toContain('action="/oauth/login"');
      expect(replay.headers['location']).toBeUndefined();
    });

    it('should reject a code exchanged with a wrong PKCE verifier', async () => {
      const form = await openLoginForm(app);
      const login = await submitLogin(app, form, { email: REGISTRATION.email, password: PATIENT_PASSWORD }).expect(302);
      const authorized = await request(app.getHttpServer())
        .get(String(login.headers['location']))
        .set('Cookie', cookiesOf(login.headers['set-cookie']).join('; '))
        .redirects(0)
        .expect(302);
      const code = new URL(String(authorized.headers['location'])).searchParams.get('code') ?? '';

      const token = await request(app.getHttpServer())
        .post('/oauth/token')
        .type('form')
        .send({ grant_type: 'authorization_code', code, client_id: E2E_CLIENT_ID, code_verifier: `${PKCE_VERIFIER}x` })
        .expect(400);

      expect(token.body).toMatchObject({ error: 'invalid_grant' });
    });
  });

  describe('when the credentials are not valid', () => {
    async function rejection(email: string, password: string): Promise<request.Response> {
      const form = await openLoginForm(app);
      return submitLogin(app, form, { email, password }).expect(200);
    }

    it('should re-render the form with one generic message for a wrong password', async () => {
      const response = await rejection(REGISTRATION.email, 'Wr0ng!Password');

      expect(response.text).toContain(INVALID_CREDENTIALS_MESSAGE);
      expect(cookiesOf(response.headers['set-cookie']).some((c) => c.startsWith('mc_as_session='))).toBe(false);
    });

    it('should answer an unknown email exactly like a wrong password so accounts cannot be enumerated', async () => {
      const wrongPassword = await rejection(REGISTRATION.email, 'Wr0ng!Password');
      const unknownEmail = await rejection('nobody@example.by', 'Wr0ng!Password');

      expect(unknownEmail.text).toContain(INVALID_CREDENTIALS_MESSAGE);
      expect(unknownEmail.status).toBe(wrongPassword.status);
    });

    it('should echo the typed email but never the password', async () => {
      const response = await rejection('typo@example.by', 'Wr0ng!Password');

      expect(response.text).toContain('value="typo@example.by"');
      expect(response.text).not.toContain('Wr0ng!Password');
    });

    it('should refuse a deactivated account with the same generic message', async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/register').send({ ...REGISTRATION, email: 'gone@example.by' }).expect(201);
      const user = await started.fakes.store.findByEmail('gone@example.by');
      await started.fakes.store.update(user?.id ?? '', { isActive: false });

      const response = await rejection('gone@example.by', PATIENT_PASSWORD);

      expect(response.text).toContain(INVALID_CREDENTIALS_MESSAGE);
    });

    it('should refuse the post when the CSRF token does not match the cookie', async () => {
      const form = await openLoginForm(app);
      const other = await openLoginForm(app);

      const response = await submitLogin(app, { ...form, csrfField: other.csrfField }, {
        email: REGISTRATION.email,
        password: PATIENT_PASSWORD,
      }).expect(403);

      expect(response.text).toContain(STALE_FORM_MESSAGE);
      expect(cookiesOf(response.headers['set-cookie']).some((c) => c.startsWith('mc_as_session='))).toBe(false);
    });

    it('should refuse the post when no CSRF cookie accompanies it', async () => {
      const form = await openLoginForm(app);

      await submitLogin(app, { ...form, csrfCookie: '' }, { email: REGISTRATION.email, password: PATIENT_PASSWORD }).expect(403);
    });

    it('should not redirect anywhere when the authorization request names an unregistered redirect_uri', async () => {
      const form = await openLoginForm(app);
      const tampered = authorizeQuery().replace(/redirect_uri=[^&]*/, 'redirect_uri=https%3A%2F%2Fevil.example%2Fcb');

      const response = await submitLogin(app, { ...form, authorizeQuery: tampered }, {
        email: REGISTRATION.email,
        password: PATIENT_PASSWORD,
      }).expect(400);

      expect(response.headers['location']).toBeUndefined();
    });
  });

  describe('when a login session is forged', () => {
    it('should show the form again instead of issuing a code for a made-up session', async () => {
      const response = await request(app.getHttpServer())
        .get(`/oauth/authorize?${authorizeQuery()}`)
        .set('Cookie', 'mc_as_session=eyJ2IjoxfQ.AAAA')
        .redirects(0)
        .expect(200);

      expect(response.text).toContain('action="/oauth/login"');
    });
  });

  describe('POST /oauth/login rate limit', () => {
    beforeEach(() => {
      setRateLimitStore(new MemoryRateLimitStore());
    });

    it('should answer 429 with the login page once one client address exceeds its login budget', async () => {
      const form = await openLoginForm(app);
      // One email per attempt: the per-account throttle (10 per 15 min) must not be what trips here.
      const attempt = (index: number): request.Test =>
        submitLogin(app, form, { email: `guess-${index}@example.by`, password: 'Wr0ng!Password' });
      for (let i = 0; i < 10; i += 1) {
        expect((await attempt(i)).status).not.toBe(429);
      }

      const limited = await attempt(10);

      expect(limited.status).toBe(429);
      expect(limited.headers['content-type']).toContain('text/html');
      expect(limited.text).toContain(THROTTLED_MESSAGE);
      expect(limited.headers['retry-after']).toBeDefined();
    });
  });
});
