import type { INestApplication } from '@nestjs/common';
import { setRateLimitStore, type RateLimitStore } from '@medcenter/common';
import request from 'supertest';

import {
  ACCOUNT_ATTEMPT_LIMIT,
  ACCOUNT_ATTEMPT_WINDOW_SECONDS,
} from '../src/modules/oauth/login/login-throttle.service';
import { THROTTLED_MESSAGE, UNAVAILABLE_MESSAGE } from '../src/modules/oauth/login/login-messages';
import { startAuthApp, type AuthApp } from './app-harness';
import { PATIENT_PASSWORD, openLoginForm, type LoginForm } from './auth-flow-helpers';

// `jose` is pure ESM and Jest's CJS runtime cannot load it (see `oauth.e2e-spec.ts`).
jest.mock('jose', () => ({
  createRemoteJWKSet: () => 'mocked-jwks',
  jwtVerify: async () => ({ payload: {}, protectedHeader: { alg: 'RS256' } }),
}));

/** `@RateLimit(10)` on `POST /oauth/login` and on `POST /api/v1/auth/register`. */
const IP_LIMIT = 10;

const OWNER = { email: 'owner@example.by', password: PATIENT_PASSWORD } as const;

/** One bucket per `identity:method:path` — the `:<minute>` suffix is dropped so a slow run cannot split it. */
class MemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, number>();

  async increment(key: string): Promise<number> {
    const bucket = key.replace(/:\d+$/, '');
    const next = (this.hits.get(bucket) ?? 0) + 1;
    this.hits.set(bucket, next);
    return next;
  }
}

interface LoginPost {
  readonly email: string;
  readonly password?: string;
  readonly extra?: Readonly<Record<string, string>>;
  readonly path?: string;
  readonly forwardedFor?: string;
}

function postLogin(app: INestApplication, form: LoginForm, post: LoginPost): request.Test {
  const call = request(app.getHttpServer())
    .post(post.path ?? '/oauth/login')
    .set('Cookie', form.csrfCookie)
    .set('X-Forwarded-For', post.forwardedFor ?? '203.0.113.10');
  return call
    .type('form')
    .send({
      email: post.email,
      password: post.password ?? 'Wr0ng!Password',
      csrf: form.csrfField,
      authorize_query: form.authorizeQuery,
      ...post.extra,
    })
    .redirects(0);
}

function postRegistration(app: INestApplication, index: number, extra: Record<string, string>): request.Test {
  return request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .set('X-Forwarded-For', '203.0.113.20')
    .send({
      email: `bot-${index}@example.by`,
      firstName: 'Бот',
      lastName: 'Ботов',
      password: PATIENT_PASSWORD,
      birthDate: '1990-05-12',
      ...extra,
    });
}

/** The brute-force ceilings of the two credential routes, over real HTTP and the real guard stack. */
describe('Credential routes rate limit (POST /oauth/login, POST /api/v1/auth/register)', () => {
  let started: AuthApp;
  let app: INestApplication;
  let form: LoginForm;

  beforeAll(async () => {
    started = await startAuthApp({ trustProxy: true });
    app = started.app;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ ...OWNER, firstName: 'Иван', lastName: 'Иванов', birthDate: '1990-05-12' })
      .expect(201);
    form = await openLoginForm(app);
  });

  afterAll(async () => {
    setRateLimitStore(null);
    await app?.close();
  });

  beforeEach(() => {
    setRateLimitStore(new MemoryRateLimitStore());
  });

  describe('when the caller rotates the body client_id to look like a new client', () => {
    it('should still answer 429 on the login form once one address exceeds its budget', async () => {
      let limited: request.Response | undefined;
      for (let attempt = 0; attempt < IP_LIMIT + 5; attempt += 1) {
        const response = await postLogin(app, form, {
          email: `rotation-${attempt}@example.by`,
          extra: { client_id: `rotate-${attempt}` },
        });
        if (attempt < IP_LIMIT) {
          expect(response.status).toBe(200);
        } else {
          limited = response;
          expect(response.status).toBe(429);
        }
      }

      expect(limited?.headers['content-type']).toContain('text/html');
      expect(limited?.text).toContain(THROTTLED_MESSAGE);
      expect(limited?.text).toContain('action="/oauth/login"');
      expect(limited?.headers['retry-after']).toBeDefined();
    });

    it('should still answer 429 on registration once one address exceeds its budget', async () => {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < IP_LIMIT + 5; attempt += 1) {
        statuses.push((await postRegistration(app, attempt, { client_id: `rotate-${attempt}` })).status);
      }

      expect(statuses.slice(0, IP_LIMIT)).toEqual(Array<number>(IP_LIMIT).fill(201));
      expect(statuses.slice(IP_LIMIT)).toEqual(Array<number>(5).fill(429));
    });
  });

  describe('when the caller varies the spelling of the route', () => {
    it.each(['/oauth/login', '/OAuth/Login', '/oauth/login/', '/oauth/login?n=2', '/OAUTH/LOGIN/?n=3'])(
      'should draw %s from the one login bucket of the address',
      async (path) => {
        const spent = IP_LIMIT - 1;
        for (let attempt = 0; attempt < spent; attempt += 1) {
          await postLogin(app, form, { email: `spelling-${attempt}@example.by`, path: '/oauth/login' });
        }

        const last = await postLogin(app, form, { email: 'spelling-last@example.by', path });
        const over = await postLogin(app, form, { email: 'spelling-over@example.by', path: '/oauth/login' });

        expect(last.status).toBe(200);
        expect(over.status).toBe(429);
      },
    );
  });

  describe('when many addresses guess the password of one account', () => {
    it('should refuse the account with 429 once its attempts are spent, whatever the address', async () => {
      const email = 'distributed@example.by';
      for (let attempt = 0; attempt < ACCOUNT_ATTEMPT_LIMIT; attempt += 1) {
        const response = await postLogin(app, form, { email, forwardedFor: `198.51.100.${attempt + 1}` });
        expect(response.status).toBe(200);
      }

      const refused = await postLogin(app, form, { email, forwardedFor: '198.51.100.200' });

      expect(refused.status).toBe(429);
      expect(refused.text).toContain(THROTTLED_MESSAGE);
      expect(refused.headers['retry-after']).toBe(String(ACCOUNT_ATTEMPT_WINDOW_SECONDS));
    });

    it('should refuse the right password too once the account is over its limit', async () => {
      const email = 'locked@example.by';
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('X-Forwarded-For', '203.0.113.99')
        .send({ email, firstName: 'Пётр', lastName: 'Петров', password: PATIENT_PASSWORD, birthDate: '1985-01-02' })
        .expect(201);
      for (let attempt = 0; attempt <= ACCOUNT_ATTEMPT_LIMIT; attempt += 1) {
        await postLogin(app, form, { email, forwardedFor: `198.51.101.${attempt + 1}` });
      }

      const refused = await postLogin(app, form, { email, password: PATIENT_PASSWORD, forwardedFor: '198.51.101.250' });

      expect(refused.status).toBe(429);
      expect(refused.headers['location']).toBeUndefined();
    });

    it('should let a valid login through and reset the account budget when the owner signs in', async () => {
      for (let attempt = 0; attempt < ACCOUNT_ATTEMPT_LIMIT - 1; attempt += 1) {
        await postLogin(app, form, { email: OWNER.email, forwardedFor: `192.0.2.${attempt + 1}` });
      }
      const signedIn = await postLogin(app, form, { ...OWNER, forwardedFor: '192.0.2.100' });

      const afterwards = await postLogin(app, form, { email: OWNER.email, forwardedFor: '192.0.2.101' });

      expect(signedIn.status).toBe(302);
      expect(afterwards.status).toBe(200);
    });
  });

  describe('when the attempt counter is unreachable', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should refuse the attempt with 503 instead of letting the guesses through', async () => {
      jest.spyOn(started.fakes.loginAttempts, 'record').mockRejectedValue(new Error('ECONNREFUSED'));

      const refused = await postLogin(app, form, { ...OWNER, forwardedFor: '192.0.2.50' });

      expect(refused.status).toBe(503);
      expect(refused.text).toContain(UNAVAILABLE_MESSAGE);
      expect(refused.headers['location']).toBeUndefined();
    });
  });
});
